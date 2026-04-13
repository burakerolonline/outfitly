import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// ChatGPT ile BİREBİR AYNI YÖNTEM:
// Responses API + image_generation tool
//
// images.edit YOK — yüzü bozuyor
// DALL-E 3 YOK — yeni kişi üretiyor
// Fallback YOK — çalışmazsa hatayı görüyoruz
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

const API = "https://api.openai.com/v1";

// ─── Responses API çağrısı (text) ───
async function responsesText(apiKey: string, input: any[]): Promise<string> {
  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", input }),
  });
  if (!res.ok) throw new Error(`Responses API ${res.status}: ${(await res.text()).substring(0, 500)}`);
  const data = await res.json();
  // Extract text from output
  for (const block of data.output || []) {
    if (block.type === "message") {
      for (const c of block.content || []) {
        if (c.type === "output_text") return c.text;
      }
    }
  }
  return "";
}

// ─── Responses API + image_generation (ChatGPT yöntemi) ───
async function responsesImage(apiKey: string, imageUrl: string, prompt: string): Promise<string> {
  console.log("    Sending Responses API + image_generation...");

  const res = await fetch(`${API}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: imageUrl,
            },
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          quality: "high",
          size: "1024x1024",
        },
      ],
    }),
  });

  const status = res.status;
  console.log(`    Response status: ${status}`);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`    ERROR BODY: ${errBody.substring(0, 1000)}`);
    throw new Error(`Responses API failed (${status}): ${errBody.substring(0, 300)}`);
  }

  const data = await res.json();

  // Log full output structure
  const types = (data.output || []).map((b: any) => {
    if (b.type === "message") {
      return `message[${(b.content || []).map((c: any) => c.type).join(",")}]`;
    }
    return b.type;
  });
  console.log(`    Output types: ${JSON.stringify(types)}`);

  // Search for image in response
  for (const block of data.output || []) {
    // Direct image_generation_call with result
    if (block.type === "image_generation_call" && block.result) {
      console.log(`    Found image in image_generation_call (${block.result.length} chars)`);
      return `data:image/png;base64,${block.result}`;
    }

    // Inside message content
    if (block.type === "message" && Array.isArray(block.content)) {
      for (const c of block.content) {
        if (c.type === "output_image" && c.image_url) {
          console.log("    Found output_image");
          return c.image_url;
        }
        if (c.type === "image" && c.image_url) {
          console.log("    Found image in message");
          return c.image_url;
        }
      }
    }
  }

  // No image found — log full response for debugging
  const fullJson = JSON.stringify(data);
  console.error(`    NO IMAGE FOUND. Full response (${fullJson.length} chars): ${fullJson.substring(0, 2000)}`);
  throw new Error("Responses API returned no image. Check Vercel logs for full response.");
}

// ═══════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Missing image or style" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });
    }

    // ═══ Resize + compress ═══
    console.log("[0] Preparing image...");
    const rawBuf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const jpg = await sharp(rawBuf)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const imageUrl = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    console.log(`    Image: ${Math.round(jpg.length / 1024)}KB`);

    // ═══ STEP 1: Analyze ═══
    console.log("[1] Analyzing...");
    let analysis: any;
    try {
      const raw = await responsesText(apiKey, [{
        role: "user",
        content: [
          { type: "input_image", image_url: imageUrl },
          { type: "input_text", text: 'Fashion analysis. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
        ],
      }]);
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`    ${analysis.gender}, ${analysis.age}, ${analysis.skinTone}`);
    } catch (err: any) {
      console.error("    Analysis failed:", err?.message);
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
      const raw = await responsesText(apiKey, [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl || ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
          },
        ],
      }]);
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`    ${outfits.map((o: any) => o.name).join(", ")}`);
    } catch (err: any) {
      console.error("    Outfits failed:", err?.message);
      outfits = mockO();
    }

    // ═══ STEP 3: Edit photos — Responses API + image_generation ═══
    console.log("[3] Editing photos (Responses API + image_generation)...");

    const results: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`  [${i + 1}/3] ${o.name}`);

      try {
        const prompt = `Look at this photo carefully. This is a real person. I need you to create a new version of this EXACT SAME photo where ONLY the clothing changes.

ABSOLUTE REQUIREMENTS:
- The person's face must be IDENTICAL — same eyes, nose, mouth, jawline, facial hair, skin texture, expression. This is the #1 priority.
- Same hair, same hairstyle, same head position
- Same pose, same arm position, same hand holding phone
- Same background (elevator/mirror)  
- Same lighting and shadows
- Same skin tone everywhere

ONLY CHANGE THE CLOTHES TO:
- Top: ${o.top}
- Bottom: ${o.bottom}
- Shoes: ${o.shoes}
- Add: ${o.accessories?.join(", ") || "nothing extra"}

Generate the edited photo. The person must be recognizable as the EXACT same individual. Not similar — IDENTICAL face.`;

        const img = await responsesImage(apiKey, imageUrl, prompt);
        results.push(img);
        console.log(`  [${i + 1}/3] ✅`);
      } catch (err: any) {
        console.error(`  [${i + 1}/3] ❌ ${err?.message?.substring(0, 300)}`);
        results.push(null);
      }
    }

    console.log(`[DONE] ${results.filter(Boolean).length}/3 images`);

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
        description: o.description || "", top: o.top || "", bottom: o.bottom || "",
        shoes: o.shoes || "", accessories: o.accessories || [],
        colors: o.colors || ["#333", "#666", "#999"], occasion: o.occasion || "",
        generatedImage: results[i] || null,
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
