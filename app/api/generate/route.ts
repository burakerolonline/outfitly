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

// ─── GPT-4o: Kıyafet önerisi metni ───────────────────────────────────────────
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

// ─── MASK üretici ─────────────────────────────────────────────────────────────
// Üst %35 = yüz/baş bölgesi → OPAQUE (alpha=255) → korunur, dokunulmaz
// Alt %65 = kıyafet/vücut bölgesi → TRANSPARENT (alpha=0) → edit edilir
async function createMask(width: number, height: number): Promise<Buffer> {
  const preserveHeight = Math.floor(height * 0.35); // korunacak alan yüksekliği

  // Önce tam transparent bir canvas oluştur (edit edilecek alan)
  const base = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();

  // Üstüne opaque beyaz katman koy (yüz/baş — korunacak alan)
  const faceBlock = await sharp({
    create: { width, height: preserveHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } },
  }).png().toBuffer();

  return sharp(base)
    .composite([{ input: faceBlock, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── GERÇEK INPAINTING: gpt-image-1 + mask ───────────────────────────────────
// Mask sayesinde yüze hiç dokunulmaz — sadece kıyafet bölgesi yeniden üretilir
async function inpaintOutfit(
  apiKey: string,
  pngBuffer: Buffer,
  maskBuffer: Buffer,
  outfit: { top: string; bottom: string; shoes: string; accessories: string[] }
): Promise<{ image: string | null; debug: string }> {
  try {
    // Kısa ve net prompt — uzun negatif listeler modeli karıştırıyor
    const prompt = `Dress this exact person in: ${outfit.top}, ${outfit.bottom}, ${outfit.shoes}${outfit.accessories?.length ? ", " + outfit.accessories.join(", ") : ""}. Preserve the person's face, identity, pose, and background exactly.`;

    const formData = new FormData();
    formData.append("image", new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }), "person.png");
    formData.append("mask",  new Blob([new Uint8Array(maskBuffer)], { type: "image/png" }), "mask.png");
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
    if (data.data?.[0]?.b64_json) return { image: `data:image/png;base64,${data.data[0].b64_json}`, debug: "inpainting mask ✓" };
    if (data.data?.[0]?.url)      return { image: data.data[0].url, debug: "inpainting mask (url) ✓" };

    return { image: null, debug: `Beklenmedik yanıt: ${JSON.stringify(data).substring(0, 200)}` };
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
    const pngBuffer = await sharp(raw)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .png({ compressionLevel: 7 })
      .toBuffer();

    // JPEG — analiz için (küçük, hızlı)
    const jpgDataUrl = `data:image/jpeg;base64,${(
      await sharp(raw).resize(800, 800, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer()
    ).toString("base64")}`;

    // Mask bir kez üretilir, 3 görsel için paylaşılır
    const maskBuffer = await createMask(1024, 1024);

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

    // ── STEP 3: 3 görsel PARALEL inpainting ──────────────
    console.log("3 görsel paralel inpainting başlatıldı...");
    const results = await Promise.all(
      outfits.map((o: any, i: number) => {
        console.log(`[${i + 1}/3] "${o.name}" başlatıldı`);
        return inpaintOutfit(apiKey, pngBuffer, maskBuffer, {
          top: o.top, bottom: o.bottom, shoes: o.shoes, accessories: o.accessories || [],
        });
      })
    );
    results.forEach((r, i) => console.log(`[${i + 1}/3] ${r.image ? "✅" : "❌"} ${r.debug}`));

    return NextResponse.json({
      success: true,
      mode: "inpainting-mask",
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
