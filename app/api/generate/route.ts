import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

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
  for (const b of data.output || [])
    if (b.type === "message")
      for (const c of b.content || [])
        if (c.type === "output_text") return c.text;
  return "";
}

async function responsesImage(apiKey: string, imageUrl: string, prompt: string): Promise<{ image: string | null; debug: string }> {
  try {
    const res = await fetch(`${API}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{
          role: "user",
          content: [
            { type: "input_image", image_url: imageUrl },
            { type: "input_text", text: prompt },
          ],
        }],
        tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { image: null, debug: `HTTP ${res.status}: ${err.substring(0, 200)}` };
    }

    const data = await res.json();

    // Log all output block types and their keys
    const debugInfo = (data.output || []).map((b: any, i: number) => {
      const keys = Object.keys(b).join(",");
      if (b.type === "message" && b.content) {
        const contentTypes = b.content.map((c: any) => `${c.type}(${Object.keys(c).join(",")})`).join("; ");
        return `[${i}] ${b.type}: ${contentTypes}`;
      }
      if (b.type === "image_generation_call") {
        return `[${i}] image_generation_call: hasResult=${!!b.result}, keys=${keys}`;
      }
      return `[${i}] ${b.type}: keys=${keys}`;
    }).join(" | ");

    // Search everywhere for image
    for (const b of data.output || []) {
      if (b.type === "image_generation_call" && b.result) {
        return { image: `data:image/png;base64,${b.result}`, debug: "Found in image_generation_call.result" };
      }
      if (b.type === "message" && b.content) {
        for (const c of b.content) {
          if (c.type === "output_image" && c.image_url) return { image: c.image_url, debug: "Found in output_image" };
          if (c.type === "image" && c.image_url) return { image: c.image_url, debug: "Found in image" };
          if (c.type === "image_generation_call" && c.result) return { image: `data:image/png;base64,${c.result}`, debug: "Found in nested image_generation_call" };
        }
      }
    }

    return { image: null, debug: `No image. Structure: ${debugInfo}` };
  } catch (e: any) {
    return { image: null, debug: `Exception: ${e?.message?.substring(0, 200)}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });

    const raw = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const jpg = await sharp(raw).resize(1024, 1024, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer();
    const imageUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;

    // Analyze
    let analysis: any;
    try {
      const r = await responsesText(apiKey, [{
        role: "user",
        content: [
          { type: "input_image", image_url: imageUrl },
          { type: "input_text", text: 'ONLY JSON:{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
        ],
      }]);
      analysis = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { analysis = mockA(); }

    // Outfits
    const sl: Record<string, string> = { "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist", "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure" };
    let outfits: any[];
    try {
      const r = await responsesText(apiKey, [{
        role: "user",
        content: [{ type: "input_text", text: `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl || ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]` }],
      }]);
      outfits = JSON.parse(r.replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // Generate images
    const results: { image: string | null; debug: string }[] = [];
    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`[${i + 1}/3] ${o.name}...`);
      const prompt = `Look at this photo. Create a new version where ONLY clothing changes. Keep IDENTICAL face, hair, pose, background, lighting. Change clothes to: Top: ${o.top}, Bottom: ${o.bottom}, Shoes: ${o.shoes}. Add: ${o.accessories?.join(", ") || "nothing"}. The person must be the EXACT same individual.`;
      const r = await responsesImage(apiKey, imageUrl, prompt);
      results.push(r);
      console.log(`[${i + 1}/3] ${r.image ? "✅" : "❌"} ${r.debug}`);
    }

    return NextResponse.json({
      success: true,
      mode: "responses-api",
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
function mockO() { return [
  { name: "Safe Stylish", description: "Classic", top: "Navy sweater", bottom: "Beige chinos", shoes: "Brown loafers", accessories: ["Watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
  { name: "Trendy Bold", description: "Bold", top: "Olive shirt", bottom: "Black trousers", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
  { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck", bottom: "Charcoal pants", shoes: "Brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
]; }
