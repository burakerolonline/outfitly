import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;
const API = "https://api.openai.com/v1";

// ─── Analiz + kıyafet metni ───────────────────────────────────────────────────
async function gptVision(apiKey: string, imageDataUrl: string, prompt: string): Promise<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageDataUrl } },
          { type: "text", text: prompt },
        ],
      }],
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error(`gptVision ${res.status}: ${(await res.text()).substring(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

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
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── ChatGPT ile AYNI yöntem: Responses API + gpt-4o + image_generation ───────
async function generateOutfitImage(
  apiKey: string,
  imageDataUrl: string,
  outfit: { top: string; bottom: string; shoes: string; accessories: string[] }
): Promise<{ image: string | null; debug: string }> {
  try {
    const prompt = [
      "You are looking at a photo of a real person.",
      "Generate a new version of this photo where ONLY the clothing has changed.",
      "KEEP IDENTICAL — do not alter in any way: the person's face, eyes, nose, mouth, facial hair, hair style, hair color, skin tone, body proportions, pose, hand positions, facial expression, background, lighting, and shadows.",
      "The output must show the EXACT same individual from the EXACT same photo — not a similar-looking person.",
      `Replace ONLY the outfit with: Top: ${outfit.top}. Bottom: ${outfit.bottom}. Shoes: ${outfit.shoes}. Accessories: ${outfit.accessories?.join(", ") || "none"}.`,
      "The clothing must look photorealistic, naturally lit to match the original photo's lighting and environment.",
    ].join(" ");

    const res = await fetch(`${API}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{
          role: "user",
          content: [
            { type: "input_image", image_url: imageDataUrl },
            { type: "input_text", text: prompt },
          ],
        }],
        tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { image: null, debug: `HTTP ${res.status}: ${errText.substring(0, 300)}` };
    }

    const data = await res.json();

    for (const b of data.output || []) {
      if (b.type === "image_generation_call" && b.result) {
        return { image: `data:image/png;base64,${b.result}`, debug: "Responses API gpt-4o ✓" };
      }
      if (b.type === "message" && b.content) {
        for (const c of b.content) {
          if (c.type === "output_image" && c.image_url) return { image: c.image_url, debug: "output_image ✓" };
          if (c.type === "image_generation_call" && c.result) return { image: `data:image/png;base64,${c.result}`, debug: "nested image_generation_call ✓" };
        }
      }
    }

    return { image: null, debug: `Görsel bulunamadı. Yanıt: ${JSON.stringify(data.output?.map((b: any) => b.type)).substring(0, 200)}` };
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

    // JPEG — analiz + Responses API için (küçük, hızlı)
    const jpgDataUrl = `data:image/jpeg;base64,${(
      await sharp(raw).resize(1024, 1024, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer()
    ).toString("base64")}`;

    // ── STEP 1: Fotoğraf analizi ──────────────────────────
    let analysis: any;
    try {
      const r = await gptVision(apiKey, jpgDataUrl,
        'Analyze this person. Return ONLY valid JSON, no extra text: {"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}'
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
        `You are a professional stylist. Person: ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone} undertone), ${analysis.hairColor} hair, ${analysis.bodyType} body. Style: ${styleLabels[style] || style}. ${productUrl ? "Incorporate: " + productUrl : ""} Generate 3 outfits. Return ONLY a JSON array: [{"name":"Safe Stylish","description":"...","top":"detailed description","bottom":"detailed description","shoes":"detailed description","accessories":["item1","item2"],"colors":["#hex1","#hex2","#hex3"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`
      );
      outfits = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // ── STEP 3: 3 görsel PARALEL üretim ──────────────────
    // Paralel: ~55sn (en yavaş tek görsel kadar), sıralı: ~165sn (timeout)
    console.log("3 görsel paralel üretiliyor...");
    const results = await Promise.all(
      outfits.map((o: any, i: number) => {
        console.log(`[${i + 1}/3] "${o.name}" başlatıldı`);
        return generateOutfitImage(apiKey, jpgDataUrl, {
          top: o.top, bottom: o.bottom, shoes: o.shoes, accessories: o.accessories || [],
        });
      })
    );
    results.forEach((r, i) => console.log(`[${i + 1}/3] ${r.image ? "✅" : "❌"} ${r.debug}`));

    return NextResponse.json({
      success: true,
      mode: "gpt-4o-responses-parallel",
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
