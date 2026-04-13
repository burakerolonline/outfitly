import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// MASK-BASED INPAINTING — FIXED VERSION
//
// Önceki sorunlar:
// 1. Yüz orijinal fotoğrafta tespit ediliyordu ama mask
//    kare (1024x1024) görsele uygulanıyordu → koordinat hatası
// 2. Mask yeterince geniş değildi
//
// Düzeltmeler:
// 1. Önce 1024x1024'e resize → sonra yüz tespit
// 2. Yüz bölgesi çok geniş tutuldu (boyun dahil)
// 3. Yüz üstü her şey de korunuyor (saç, kafa)
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

const OPENAI = "https://api.openai.com/v1";

async function gptText(apiKey: string, messages: any[]): Promise<string> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages, max_tokens: 2000, temperature: 0.5 }),
  });
  if (!res.ok) throw new Error(`GPT ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Yüzün alt sınırını tespit et (% olarak) ───
async function detectFaceBottom(apiKey: string, resizedBase64: string): Promise<number> {
  try {
    const dataUrl = `data:image/png;base64,${resizedBase64}`;
    const raw = await gptText(apiKey, [{
      role: "user",
      content: [
        {
          type: "text",
          text: `This is a 1024x1024 square image. Find where the person's CHIN ends (the bottom of their face/jaw, NOT including neck or body).

Express this as a percentage from the top of the image. For example, if the chin is at pixel 400 out of 1024, that's about 39%.

Respond with ONLY a single number (the percentage), nothing else. Example: 42`,
        },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }]);

    const percent = parseInt(raw.trim(), 10);
    if (isNaN(percent) || percent < 10 || percent > 80) {
      console.log(`Face detection returned invalid value: "${raw}", using default 40%`);
      return 40;
    }
    console.log(`Face bottom detected at: ${percent}%`);
    return percent;
  } catch (err) {
    console.error("Face detection failed:", err);
    return 40; // Default: face ends at 40%
  }
}

// ─── Mask oluştur ───
// Basit yatay bölme: üst kısım = korunan (yüz+saç+kafa), alt kısım = düzenlenecek (gövde+kıyafet)
// OpenAI mask formatı: transparent (alpha=0) = düzenle, opaque (alpha=255) = koru
async function createSimpleMask(size: number, protectTopPercent: number): Promise<Buffer> {
  const splitY = Math.floor((protectTopPercent / 100) * size);

  console.log(`Mask: top ${protectTopPercent}% protected (0-${splitY}px), bottom ${100 - protectTopPercent}% editable (${splitY}-${size}px)`);

  const channels = 4;
  const buffer = Buffer.alloc(size * size * channels);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;

      if (y < splitY) {
        // ÜST KISIM (yüz, saç, kafa) → opaque → KORU
        buffer[idx] = 0;       // R
        buffer[idx + 1] = 0;   // G
        buffer[idx + 2] = 0;   // B
        buffer[idx + 3] = 255; // A = opaque = KEEP
      } else {
        // ALT KISIM (gövde, kıyafet) → transparent → DÜZENLE
        buffer[idx] = 0;       // R
        buffer[idx + 1] = 0;   // G
        buffer[idx + 2] = 0;   // B
        buffer[idx + 3] = 0;   // A = transparent = EDIT
      }
    }
  }

  return sharp(buffer, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

// ─── Inpainting ───
async function inpaint(apiKey: string, imagePng: Buffer, maskPng: Buffer, prompt: string): Promise<string | null> {
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(imagePng)], { type: "image/png" }), "photo.png");
  formData.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
  formData.append("model", "gpt-image-1");
  formData.append("prompt", prompt);
  formData.append("n", "1");
  formData.append("size", "1024x1024");

  const res = await fetch(`${OPENAI}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  console.log(`    images.edit status: ${res.status}`);

  if (!res.ok) {
    const err = await res.text();
    console.error(`    images.edit error: ${err.substring(0, 400)}`);
    return null;
  }

  const data = await res.json();
  if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
  if (data.data?.[0]?.url) return data.data[0].url;
  console.log("    No image in response");
  return null;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, style, productUrl } = body;

    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Missing image or style" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: true, mode: "mock", analysis: getMockAnalysis(), outfits: getMockOutfits() });
    }

    // ═══ Görseli 1024x1024 PNG'ye dönüştür ═══
    console.log("=== PREPARING IMAGE ===");
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Clean, "base64");

    const resizedPng = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: "cover", position: "attention" }) // "attention" = akıllı crop, yüzü ortalama
      .png()
      .toBuffer();

    const resizedBase64 = resizedPng.toString("base64");
    const resizedDataUrl = `data:image/png;base64,${resizedBase64}`;
    console.log(`Image: ${resizedPng.length} bytes (1024x1024)`);

    // ═══ STEP 1: RESIZE EDİLMİŞ görselde yüz tespit ═══
    console.log("=== STEP 1: Face detection on RESIZED image ===");
    const faceBottomPercent = await detectFaceBottom(apiKey, resizedBase64);

    // Yüz altına %10 ekstra padding ekle (boyun dahil)
    const protectPercent = Math.min(faceBottomPercent + 10, 70);
    console.log(`Protecting top ${protectPercent}% of image`);

    // ═══ STEP 2: Mask oluştur ═══
    console.log("=== STEP 2: Creating mask ===");
    const maskPng = await createSimpleMask(1024, protectPercent);
    console.log(`Mask: ${maskPng.length} bytes`);

    // ═══ STEP 3: Kişiyi analiz et ═══
    console.log("=== STEP 3: Analyzing person ===");
    let analysis;
    try {
      const raw = await gptText(apiKey, [{
        role: "user",
        content: [
          { type: "text", text: 'Fashion analysis. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: resizedDataUrl } },
        ],
      }]);
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`Analysis: ${analysis.gender}, ${analysis.skinTone}, ${analysis.hairColor}`);
    } catch (err) {
      console.error("Analysis failed:", err);
      analysis = getMockAnalysis();
    }

    // ═══ STEP 4: Kıyafet önerileri ═══
    console.log("=== STEP 4: Outfit suggestions ===");
    const styleLabels: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury", streetwear: "Streetwear / Urban",
      minimal: "Minimalist", "smart-casual": "Smart Casual",
      luxury: "High Luxury / Designer", sport: "Athleisure",
    };

    let outfits;
    try {
      const raw = await gptText(apiKey, [{
        role: "user",
        content: `World-class stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone}), ${analysis.hairColor} hair, ${analysis.bodyType}.\nSTYLE: ${styleLabels[style] || style}\n${productUrl ? "INCLUDE: " + productUrl : ""}\n\n3 outfits. ONLY JSON:\n[{"name":"Safe Stylish","description":"...","top":"garment fabric color #hex","bottom":"garment fabric color #hex","shoes":"shoe material color","accessories":["item1","item2"],"colors":["#hex1","#hex2","#hex3"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
      }]);
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`Outfits: ${outfits.map((o: any) => o.name).join(", ")}`);
    } catch (err) {
      console.error("Outfits failed:", err);
      outfits = getMockOutfits();
    }

    // ═══ STEP 5: Mask ile inpainting ═══
    console.log("=== STEP 5: Inpainting (mask-based) ===");

    const editResults: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const outfit = outfits[i];
      console.log(`  Outfit ${i + 1}/3: ${outfit.name}`);

      const prompt = `Fill the transparent area of the mask with new clothing on the existing person. The top part of the image (face, hair, head) is protected and already preserved.

In the editable area, dress the person in:
- Top: ${outfit.top}
- Bottom: ${outfit.bottom}  
- Shoes: ${outfit.shoes}
- Accessories: ${outfit.accessories?.join(", ") || "none"}

The clothing must seamlessly blend with the protected area above. Match the person's body shape, the existing lighting, and the photo's perspective. The result must look like a natural, unedited photograph.`;

      const result = await inpaint(apiKey, resizedPng, maskPng, prompt);
      editResults.push(result);
      console.log(`  ${result ? "✅" : "❌"} Outfit ${i + 1}/3`);
    }

    const finalOutfits = outfits.map((o: any, i: number) => ({
      name: o.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
      description: o.description || "",
      top: o.top || "",
      bottom: o.bottom || "",
      shoes: o.shoes || "",
      accessories: o.accessories || [],
      colors: o.colors || ["#333", "#666", "#999"],
      occasion: o.occasion || "",
      generatedImage: editResults[i] || null,
    }));

    console.log(`=== DONE === Mode: mask-inpainting, Images: ${editResults.filter(Boolean).length}/3`);

    return NextResponse.json({
      success: true,
      mode: "mask-inpainting",
      analysis: {
        skinTone: analysis.skinTone || "Medium",
        undertone: analysis.undertone || "Neutral",
        faceShape: analysis.faceShape || "Oval",
        bodyType: analysis.bodyType || "Mesomorph",
        hairColor: analysis.hairColor || "Brown",
        gender: analysis.gender || "Unknown",
        confidence: analysis.confidence || "90",
      },
      outfits: finalOutfits,
    });
  } catch (error: any) {
    console.error("FATAL:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Generation failed" }, { status: 500 });
  }
}

function getMockAnalysis() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}

function getMockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater (#1B2A4A)", bottom: "Beige chinos (#D2B48C)", shoes: "Brown loafers", accessories: ["Gold watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive shirt (#556B2F)", bottom: "Black trousers (#1A1A1A)", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck (#722F37)", bottom: "Charcoal pants (#36454F)", shoes: "Oxford brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
