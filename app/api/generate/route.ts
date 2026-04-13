import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 120;
const API = "https://api.openai.com/v1";

// ─── Analiz ve kıyafet metni için (gpt-4o-mini — verification gerektirmez) ───
async function responsesText(apiKey: string, input: any[]): Promise<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: input, max_tokens: 1500 }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function analyzeImage(apiKey: string, jpgDataUrl: string): Promise<string> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: jpgDataUrl } },
          { type: "text", text: 'Analyze this person. Return ONLY valid JSON: {"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
        ],
      }],
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}: ${(await res.text()).substring(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── gpt-image-1 ile görsel düzenleme (PARALEL çalışır) ───────────────────────
async function editImageWithGptImage1(
  apiKey: string,
  imagePngBuffer: Buffer,
  outfit: { top: string; bottom: string; shoes: string; accessories: string[] }
): Promise<{ image: string | null; debug: string }> {
  try {
    const prompt = [
      "This is a real photograph of a specific person.",
      "TASK: Edit ONLY their clothing. Keep everything else 100% identical.",
      "MUST PRESERVE: exact face, eyes, nose, mouth, facial hair, hair style, hair color, skin tone, body shape, pose, hand position, expression, background, lighting, shadows, camera angle.",
      "DO NOT generate a new person. DO NOT change the face. The result must show the EXACT same individual.",
      `NEW OUTFIT: Top: ${outfit.top}. Bottom: ${outfit.bottom}. Shoes: ${outfit.shoes}. Accessories: ${outfit.accessories?.join(", ") || "none"}.`,
      "The new clothing must look photorealistic with lighting that matches the original photo.",
    ].join(" ");

    const formData = new FormData();
    const pngBlob = new Blob([new Uint8Array(imagePngBuffer)], { type: "image/png" });
    formData.append("image", pngBlob, "person.png");
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
      if (res.status === 404 || errText.includes("model") || errText.includes("not_found")) {
        console.log("[gpt-image-1] erişim yok, Responses API fallback...");
        return await fallbackResponsesImage(apiKey, imagePngBuffer, outfit);
      }
      return { image: null, debug: `HTTP ${res.status}: ${errText.substring(0, 300)}` };
    }

    const data = await res.json();
    if (data.data?.[0]?.b64_json) {
      return { image: `data:image/png;base64,${data.data[0].b64_json}`, debug: "gpt-image-1 edits ✓" };
    }
    if (data.data?.[0]?.url) {
      return { image: data.data[0].url, debug: "gpt-image-1 edits (url) ✓" };
    }
    return { image: null, debug: `gpt-image-1: beklenmedik yanıt: ${JSON.stringify(data).substring(0, 200)}` };
  } catch (e: any) {
    return { image: null, debug: `Exception: ${e?.message?.substring(0, 200)}` };
  }
}

// ─── Fallback: Responses API ──────────────────────────────────────────────────
async function fallbackResponsesImage(
  apiKey: string,
  imagePngBuffer: Buffer,
  outfit: { top: string; bottom: string; shoes: string; accessories: string[] }
): Promise<{ image: string | null; debug: string }> {
  try {
    const imageUrl = `data:image/png;base64,${imagePngBuffer.toString("base64")}`;
    const prompt = [
      "Look carefully at this photograph.",
      "Edit ONLY the clothing of this person. Preserve everything else identically:",
      "same face, same eyes, same hair, same skin tone, same body, same pose, same background, same lighting.",
      "This must be the EXACT same individual — not a similar-looking person.",
      `New outfit: Top: ${outfit.top}. Bottom: ${outfit.bottom}. Shoes: ${outfit.shoes}.`,
      `Accessories: ${outfit.accessories?.join(", ") || "none"}.`,
    ].join(" ");

    const res = await fetch(`${API}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{ role: "user", content: [{ type: "input_image", image_url: imageUrl }, { type: "input_text", text: prompt }] }],
        tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
      }),
    });

    if (!res.ok) return { image: null, debug: `Fallback HTTP ${res.status}` };
    const data = await res.json();
    for (const b of data.output || []) {
      if (b.type === "image_generation_call" && b.result) {
        return { image: `data:image/png;base64,${b.result}`, debug: "Fallback Responses API ✓" };
      }
      if (b.type === "message" && b.content) {
        for (const c of b.content) {
          if ((c.type === "output_image" || c.type === "image") && c.image_url) return { image: c.image_url, debug: "Fallback output_image ✓" };
          if (c.type === "image_generation_call" && c.result) return { image: `data:image/png;base64,${c.result}`, debug: "Fallback nested ✓" };
        }
      }
    }
    return { image: null, debug: "Fallback: görsel bulunamadı" };
  } catch (e: any) {
    return { image: null, debug: `Fallback exception: ${e?.message?.substring(0, 200)}` };
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

    // PNG: gpt-image-1 edits için
    const pngBuffer = await sharp(raw)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .png({ compressionLevel: 7 })
      .toBuffer();

    // JPEG: analiz için (daha küçük)
    const jpgDataUrl = `data:image/jpeg;base64,${(
      await sharp(raw).resize(800, 800, { fit: "cover", position: "attention" }).jpeg({ quality: 80 }).toBuffer()
    ).toString("base64")}`;

    // ── STEP 1: Analiz (gpt-4o-mini) ─────────────────────
    let analysis: any;
    try {
      const r = await analyzeImage(apiKey, jpgDataUrl);
      analysis = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { analysis = mockA(); }

    // ── STEP 2: Kıyafet önerileri (gpt-4o-mini) ──────────
    const styleLabels: Record<string, string> = {
      "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist",
      "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure",
    };
    let outfits: any[];
    try {
      const r = await responsesText(apiKey, [{
        role: "user",
        content: `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${styleLabels[style] || style}. ${productUrl || ""} Generate 3 outfits. Return ONLY JSON array: [{"name":"Safe Stylish","description":"...","top":"detailed description","bottom":"detailed description","shoes":"detailed description","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
      }]);
      outfits = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // ── STEP 3: Görsel üretimi — 3'ü PARALEL ─────────────
    console.log("3 görsel paralel üretiliyor...");
    const results = await Promise.all(
      outfits.map((o: any, i: number) => {
        console.log(`[${i + 1}/3] "${o.name}" başlatıldı`);
        return editImageWithGptImage1(apiKey, pngBuffer, {
          top: o.top, bottom: o.bottom, shoes: o.shoes, accessories: o.accessories || [],
        });
      })
    );
    results.forEach((r, i) => console.log(`[${i + 1}/3] ${r.image ? "✅" : "❌"} ${r.debug}`));

    return NextResponse.json({
      success: true,
      mode: "gpt-image-1-edits-parallel",
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
