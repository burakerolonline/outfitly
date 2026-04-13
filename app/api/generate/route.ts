import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// ChatGPT'nin BİREBİR AYNI YÖNTEMİ:
// POST /v1/responses + image_generation tool
//
// Organization verified → Responses API aktif
// images.edit YOK, DALL-E YOK, mask YOK
// Model fotoğrafı GÖRÜYOR ve aynı yüzle üretiyor
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

const API = "https://api.openai.com/v1";

async function responsesText(apiKey: string, input: any[]): Promise<string> {
  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", input }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).substring(0, 300)}`);
  const data = await res.json();
  for (const b of data.output || []) {
    if (b.type === "message") {
      for (const c of b.content || []) {
        if (c.type === "output_text") return c.text;
      }
    }
  }
  return "";
}

async function responsesImage(apiKey: string, imageUrl: string, prompt: string): Promise<string> {
  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [{
        role: "user",
        content: [
          { type: "input_image", image_url: imageUrl, detail: "high" },
          { type: "input_text", text: prompt },
        ],
      }],
      tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Responses API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();

  for (const b of data.output || []) {
    if (b.type === "image_generation_call" && b.result) {
      return `data:image/png;base64,${b.result}`;
    }
    if (b.type === "message") {
      for (const c of b.content || []) {
        if (c.type === "output_image" && c.image_url) return c.image_url;
        if (c.type === "image" && c.image_url) return c.image_url;
      }
    }
  }

  throw new Error("No image in response");
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });

    // Resize + compress
    const raw = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const jpg = await sharp(raw)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const imageUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;

    // ═══ STEP 1: Analyze ═══
    console.log("[1] Analyzing...");
    let analysis: any;
    try {
      const r = await responsesText(apiKey, [{
        role: "user",
        content: [
          { type: "input_image", image_url: imageUrl, detail: "high" },
          { type: "input_text", text: 'Fashion analysis. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
        ],
      }]);
      analysis = JSON.parse(r.replace(/```json|```/g, "").trim());
      console.log(`    ${analysis.gender}, ${analysis.age}, ${analysis.skinTone}`);
    } catch (e: any) {
      console.error("    Analysis error:", e?.message);
      analysis = mockA();
    }

    // ═══ STEP 2: Outfits ═══
    console.log("[2] Outfits...");
    const sl: Record<string, string> = {
      "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist",
      "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure",
    };
    let outfits: any[];
    try {
      const r = await responsesText(apiKey, [{
        role: "user",
        content: [
          { type: "input_text", text: `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl || ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]` },
        ],
      }]);
      outfits = JSON.parse(r.replace(/```json|```/g, "").trim());
      console.log(`    ${outfits.map((o: any) => o.name).join(", ")}`);
    } catch (e: any) {
      console.error("    Outfits error:", e?.message);
      outfits = mockO();
    }

    // ═══ STEP 3: Generate outfit photos (Responses API + image_generation) ═══
    console.log("[3] Generating...");
    const results: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`    [${i + 1}/3] ${o.name}...`);
      try {
        const prompt = `Look at this photo. This is a REAL person. Create a new version of this EXACT photo where ONLY the clothing changes.

CRITICAL — MUST preserve:
- IDENTICAL face (every feature: eyes, nose, mouth, jawline, skin texture)
- IDENTICAL hair and hairstyle
- IDENTICAL pose, arm position, hand holding phone
- IDENTICAL background and lighting
- IDENTICAL skin tone

ONLY change clothes to:
- Top: ${o.top}
- Bottom: ${o.bottom}
- Shoes: ${o.shoes}
- Add: ${o.accessories?.join(", ") || "nothing"}

The person must be recognizable as the EXACT same individual. Generate the photo.`;

        const img = await responsesImage(apiKey, imageUrl, prompt);
        results.push(img);
        console.log(`    [${i + 1}/3] ✅`);
      } catch (e: any) {
        console.error(`    [${i + 1}/3] ❌ ${e?.message?.substring(0, 200)}`);
        results.push(null);
      }
    }

    console.log(`[DONE] ${results.filter(Boolean).length}/3`);

    return NextResponse.json({
      success: true,
      mode: "responses-api",
      analysis: {
        skinTone: analysis.skinTone || "Medium",
        undertone: analysis.undertone || "Neutral",
        faceShape: analysis.faceShape || "Oval",
        bodyType: analysis.bodyType || "Mesomorph",
        hairColor: analysis.hairColor || "Brown",
        gender: analysis.gender || "Unknown",
        confidence: analysis.confidence || "90",
      },
      outfits: outfits.map((o: any, i: number) => ({
        name: o.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
        description: o.description || "",
        top: o.top || "", bottom: o.bottom || "", shoes: o.shoes || "",
        accessories: o.accessories || [], colors: o.colors || ["#333", "#666", "#999"],
        occasion: o.occasion || "", generatedImage: results[i] || null,
      })),
    });
  } catch (error: any) {
    console.error("FATAL:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

function mockA() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}
function mockO() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater", bottom: "Beige chinos", shoes: "Brown loafers", accessories: ["Watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive shirt", bottom: "Black trousers", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck", bottom: "Charcoal pants", shoes: "Brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
