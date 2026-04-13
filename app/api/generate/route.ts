import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// MASK-BASED INPAINTING
//
// 1. GPT-4o Vision → analiz + yüz pozisyonu tespit
// 2. sharp → mask oluştur (yüz=korunan, gövde=düzenlenecek)
// 3. images.edit + mask → SADECE kıyafet alanı düzenlenir
//    Yüz pikselleri HİÇ değişmez.
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

const OPENAI = "https://api.openai.com/v1";

// ─── GPT-4o text çağrısı ───
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

// ─── Yüz pozisyonunu tespit et ───
async function detectFaceRegion(apiKey: string, imageDataUrl: string): Promise<{ topPercent: number; bottomPercent: number; leftPercent: number; rightPercent: number }> {
  try {
    const raw = await gptText(apiKey, [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Look at this photo and find the person's HEAD (including hair, forehead to chin). 
Give me the bounding box as percentages of the image dimensions.
Respond ONLY with JSON, no markdown:
{"topPercent": number, "bottomPercent": number, "leftPercent": number, "rightPercent": number}
Where 0=top/left edge, 100=bottom/right edge.
Include some margin around the head (add ~5% padding on each side).`,
        },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    }]);
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    console.log("Face region:", JSON.stringify(parsed));
    return parsed;
  } catch (err) {
    console.error("Face detection failed, using default:", err);
    // Default: face is roughly in the top 40% of image
    return { topPercent: 0, bottomPercent: 40, leftPercent: 15, rightPercent: 85 };
  }
}

// ─── Mask oluştur: yüz=opaque(korunan), gövde=transparent(düzenlenecek) ───
async function createMask(
  width: number,
  height: number,
  faceRegion: { topPercent: number; bottomPercent: number; leftPercent: number; rightPercent: number }
): Promise<Buffer> {
  // Yüz bölgesi koordinatları (piksel)
  const faceTop = Math.max(0, Math.floor((faceRegion.topPercent / 100) * height));
  const faceBottom = Math.min(height, Math.floor((faceRegion.bottomPercent / 100) * height));
  const faceLeft = Math.max(0, Math.floor((faceRegion.leftPercent / 100) * width));
  const faceRight = Math.min(width, Math.floor((faceRegion.rightPercent / 100) * width));

  console.log(`Mask: ${width}x${height}, face protected: y=${faceTop}-${faceBottom}, x=${faceLeft}-${faceRight}`);

  // RGBA buffer oluştur
  const channels = 4;
  const buffer = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;

      const inFaceRegion =
        y >= faceTop && y <= faceBottom &&
        x >= faceLeft && x <= faceRight;

      if (inFaceRegion) {
        // YÜZ BÖLGESİ → opaque (alpha=255) → KORUNAN, düzenlenmez
        buffer[idx] = 255;     // R
        buffer[idx + 1] = 255; // G
        buffer[idx + 2] = 255; // B
        buffer[idx + 3] = 255; // A = opaque = KEEP
      } else {
        // GÖVDe/KIYAFET → transparent (alpha=0) → DÜZENLENECEK
        buffer[idx] = 0;       // R
        buffer[idx + 1] = 0;   // G
        buffer[idx + 2] = 0;   // B
        buffer[idx + 3] = 0;   // A = transparent = EDIT
      }
    }
  }

  // PNG olarak encode et
  const maskPng = await sharp(buffer, { raw: { width, height, channels } })
    .png()
    .toBuffer();

  console.log(`Mask created: ${maskPng.length} bytes`);
  return maskPng;
}

// ─── images.edit + mask ile inpainting ───
async function inpaintOutfit(
  apiKey: string,
  imagePngBuffer: Buffer,
  maskPngBuffer: Buffer,
  prompt: string
): Promise<string | null> {
  const formData = new FormData();

  const imageBlob = new Blob([new Uint8Array(imagePngBuffer)], { type: "image/png" });
  const maskBlob = new Blob([new Uint8Array(maskPngBuffer)], { type: "image/png" });

  formData.append("image", imageBlob, "photo.png");
  formData.append("mask", maskBlob, "mask.png");
  formData.append("model", "gpt-image-1");
  formData.append("prompt", prompt);
  formData.append("n", "1");
  formData.append("size", "1024x1024");

  const res = await fetch(`${OPENAI}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`images.edit error ${res.status}: ${errText.substring(0, 500)}`);
    return null;
  }

  const data = await res.json();
  if (data.data?.[0]?.b64_json) {
    return `data:image/png;base64,${data.data[0].b64_json}`;
  }
  if (data.data?.[0]?.url) {
    return data.data[0].url;
  }
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

    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // ─── Görseli 1024x1024 PNG'ye dönüştür ───
    console.log("Preparing image...");
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuffer = Buffer.from(base64Clean, "base64");

    const resizedImage = await sharp(inputBuffer)
      .resize(1024, 1024, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    console.log(`Image resized to 1024x1024 (${resizedImage.length} bytes)`);

    // ═══ STEP 1: Yüz pozisyonunu tespit et ═══
    console.log("=== STEP 1: Detecting face ===");
    const faceRegion = await detectFaceRegion(apiKey, imageDataUrl);

    // ═══ STEP 2: Mask oluştur ═══
    console.log("=== STEP 2: Creating mask ===");
    const maskBuffer = await createMask(1024, 1024, faceRegion);

    // ═══ STEP 3: Kişiyi analiz et ═══
    console.log("=== STEP 3: Analyzing person ===");
    let analysis;
    try {
      const raw = await gptText(apiKey, [{
        role: "user",
        content: [
          { type: "text", text: 'Analyze for fashion. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      }]);
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log("Analysis:", JSON.stringify(analysis));
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
      console.log("Outfits:", outfits.map((o: any) => o.name).join(", "));
    } catch (err) {
      console.error("Outfits failed:", err);
      outfits = getMockOutfits();
    }

    // ═══ STEP 5: Mask ile inpainting — sadece kıyafet değişir ═══
    console.log("=== STEP 5: Inpainting with mask ===");

    const editResults: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const outfit = outfits[i];
      console.log(`  Outfit ${i + 1}/3: ${outfit.name}...`);

      const prompt = `Edit ONLY the clothing area of this photo (the masked/transparent region). The face and head area is protected and must not be touched at all.

Replace the visible clothing with:
- Top/shirt: ${outfit.top}
- Pants/bottom: ${outfit.bottom}
- Shoes: ${outfit.shoes}
- Add accessories: ${outfit.accessories?.join(", ") || "none"}

Keep the person's exact body shape and pose. The new clothes must fit naturally with realistic fabric, folds, and shadows matching the existing lighting. The result must look like a real photograph.`;

      try {
        const result = await inpaintOutfit(apiKey, resizedImage, maskBuffer, prompt);
        editResults.push(result);
        console.log(`  ${result ? "✅" : "❌"} Outfit ${i + 1}/3`);
      } catch (err: any) {
        console.error(`  ❌ Outfit ${i + 1}/3 error:`, err?.message);
        editResults.push(null);
      }
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

    console.log(`=== DONE === Images: ${editResults.filter(Boolean).length}/3`);

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
