import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;
const API = "https://api.openai.com/v1";

// ─── GPT-4o: Görsel analiz ────────────────────────────────────────────────────
async function gptVision(apiKey: string, imageDataUrl: string, prompt: string): Promise<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl } }, { type: "text", text: prompt }] }],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`gptVision ${res.status}: ${(await res.text()).substring(0, 300)}`);
  return (await res.json()).choices?.[0]?.message?.content || "";
}

// ─── GPT-4o: Kıyafet önerisi ─────────────────────────────────────────────────
async function gptText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`gptText ${res.status}: ${(await res.text()).substring(0, 300)}`);
  return (await res.json()).choices?.[0]?.message?.content || "";
}

// ─── OUTFIT GENERATION: Mask yok — sadece güçlü prompt ──────────────────────
// ChatGPT'nin yaptığı ile aynı: image + prompt, mask gönderme.
// Mask modeli karıştırıyor: boş alanı kendi hayal ettiği vücutla dolduruyor.
// gpt-image-1 bu tür "keep person, change clothes" promptlarını maskesiz çok daha iyi anlıyor.
async function inpaintOutfit(
  apiKey: string,
  pngBuffer: Buffer,
  outfit: { top: string; bottom: string; shoes: string; accessories: string[] }
): Promise<{ image: string | null; debug: string }> {
  try {
    const outfitDesc = [outfit.top, outfit.bottom, outfit.shoes, ...(outfit.accessories || [])].filter(Boolean).join(", ");

    const prompt =
      `This is a real photo of a specific person. ` +
      `Keep this exact person: same face, same identity, same skin tone, same hair color and style, ` +
      `same body proportions, same pose, same background, same lighting, same camera angle. ` +
      `The person's appearance must be identical to the original photo. ` +
      `Only change what they are wearing. ` +
      `Dress them in the following outfit: ${outfitDesc}. ` +
      `Do not change the face, do not change the background, do not change the pose. ` +
      `Result should look like the same photo but with different clothes.`;

    const formData = new FormData();
    formData.append("image", new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }), "person.png");
    formData.append("prompt", prompt);
    formData.append("model", "gpt-image-1");
    formData.append("size", "1024x1024");
    formData.append("quality", "high");
    formData.append("n", "1");

    const res = await fetch(`${API}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { image: null, debug: `HTTP ${res.status}: ${errText.substring(0, 300)}` };
    }

    const data = await res.json();
    let generatedImage: string | null = null;

    if (data.data?.[0]?.b64_json) {
      generatedImage = `data:image/png;base64,${data.data[0].b64_json}`;
    } else if (data.data?.[0]?.url) {
      generatedImage = data.data[0].url;
    }

    if (!generatedImage) {
      return { image: null, debug: `Beklenmedik yanıt: ${JSON.stringify(data).substring(0, 200)}` };
    }

    return { image: generatedImage, debug: "image-edit ✓" };
  } catch (e: any) {
    return { image: null, debug: `Exception: ${e?.message?.substring(0, 200)}` };
  }
}

// ─── ANA HANDLER ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });

    const raw = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");

    // PNG 1024x1024 — inpainting için
    // position: "top" → yüz her zaman üstte kalır, attention gibi tahmin edilemez kırpma olmaz
    const pngBuffer = await sharp(raw)
      .resize(1024, 1024, { fit: "cover", position: "top" })
      .png({ compressionLevel: 7 })
      .toBuffer();

    // JPEG — analiz için
    const jpgDataUrl = `data:image/jpeg;base64,${(
      await sharp(raw).resize(800, 800, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer()
    ).toString("base64")}`;

    // Mask kaldırıldı — gpt-image-1 prompt ile yönlendiriliyor

    // ── STEP 1: Analiz ────────────────────────────────────
    let analysis: any;
    try {
      const r = await gptVision(apiKey, jpgDataUrl,
        'Analyze this person. Return ONLY valid JSON: {"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}'
      );
      analysis = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { analysis = mockA(); }

    // ── STEP 2: Kıyafet önerileri ─────────────────────────
    const styleLabels: Record<string, string> = {
      "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist",
      "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure",
    };
    let outfits: any[];
    try {
      const r = await gptText(apiKey,
        `Professional stylist. Person: ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone} undertone), ${analysis.hairColor} hair, ${analysis.bodyType} body. Style: ${styleLabels[style] || style}. ${productUrl ? "Incorporate: " + productUrl : ""} Generate 3 outfits. Return ONLY JSON array: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`
      );
      outfits = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // ── STEP 3: Paralel inpainting ─────────────────────────
    console.log("3 görsel paralel inpainting başlatıldı...");
    const results = await Promise.all(
      outfits.map((o: any, i: number) => {
        console.log(`[${i + 1}/3] "${o.name}" başlatıldı`);
        return inpaintOutfit(apiKey, pngBuffer, {
          top: o.top, bottom: o.bottom, shoes: o.shoes, accessories: o.accessories || [],
        });
      })
    );
    results.forEach((r, i) => console.log(`[${i + 1}/3] ${r.image ? "✅" : "❌"} ${r.debug}`));

    return NextResponse.json({
      success: true,
      mode: "image-edit",
      analysis: {
        skinTone: analysis.skinTone || "Medium", undertone: analysis.undertone || "Neutral",
        faceShape: analysis.faceShape || "Oval", bodyType: analysis.bodyType || "Mesomorph",
        hairColor: analysis.hairColor || "Brown", gender: analysis.gender || "Unknown",
        confidence: analysis.confidence || "90",
      },
      outfits: outfits.map((o: any, i: number) => ({
        name: o.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
        description: (o.description || "") + ` [${results[i]?.debug || "?"}]`,
        top: o.top || "", bottom: o.bottom || "", shoes: o.shoes || "",
        accessories: o.accessories || [], colors: o.colors || ["#333", "#666", "#999"],
        occasion: o.occasion || "", generatedImage: results[i]?.image || null,
      })),
    });
  } catch (error: any) {
    console.error("FATAL:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

function mockA() { return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" }; }
function mockO() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Camel cashmere sweater", bottom: "Navy tailored chinos", shoes: "Brown leather loafers", accessories: ["Gold watch", "Brown belt"], colors: ["#C19A6B", "#000080", "#6B4513"], occasion: "Casual outings", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive oversized shirt", bottom: "Black straight trousers", shoes: "White chunky sneakers", accessories: ["Silver chain", "Black cap"], colors: ["#556B2F", "#1A1A1A", "#FFFFFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy merino turtleneck", bottom: "Charcoal slim trousers", shoes: "Cognac Oxford brogues", accessories: ["Leather watch", "Silk scarf"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
