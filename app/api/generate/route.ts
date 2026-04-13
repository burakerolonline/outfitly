import { NextRequest, NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1";

export const maxDuration = 120;

async function callResponses(apiKey: string, input: any[], tools?: any[]) {
  const body: any = { model: "gpt-4o", input };
  if (tools) body.tools = tools;

  const res = await fetch(`${OPENAI_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  return await res.json();
}

function extractText(data: any): string {
  for (const block of data.output || []) {
    if (block.type === "message") {
      for (const content of block.content || []) {
        if (content.type === "output_text") return content.text;
      }
    }
  }
  return "";
}

function extractImage(data: any): string | null {
  for (const block of data.output || []) {
    if (block.type === "image_generation_call" && block.result) {
      return `data:image/png;base64,${block.result}`;
    }
    if (block.type === "message") {
      for (const content of block.content || []) {
        if (content.type === "image" && content.image_url) return content.image_url;
        if (content.type === "image_generation_call" && content.result) return `data:image/png;base64,${content.result}`;
      }
    }
  }
  return null;
}

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

    // ═══════════════════════════════════════════════
    // STEP 1: Analyze photo
    // ═══════════════════════════════════════════════
    console.log("Step 1: Analyzing...");

    let analysis;
    try {
      const data = await callResponses(apiKey, [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: imageDataUrl },
            {
              type: "input_text",
              text: 'Analyze this person for fashion styling. Respond ONLY valid JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","confidence":95}',
            },
          ],
        },
      ]);
      analysis = JSON.parse(extractText(data).replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Analysis failed:", err);
      analysis = getMockAnalysis();
    }

    // ═══════════════════════════════════════════════
    // STEP 2: Outfit suggestions
    // ═══════════════════════════════════════════════
    console.log("Step 2: Outfits...");

    const styleLabels: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury",
      streetwear: "Streetwear / Urban",
      minimal: "Minimalist",
      "smart-casual": "Smart Casual",
      luxury: "High Luxury / Designer",
      sport: "Athleisure",
    };

    let outfits;
    try {
      const data = await callResponses(apiKey, [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `World-class stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone}), ${analysis.hairColor} hair, ${analysis.bodyType}.\nSTYLE: ${styleLabels[style] || style}\n${productUrl ? "INCLUDE: " + productUrl : ""}\n\n3 outfits. ONLY JSON array:\n[{"name":"Safe Stylish","description":"...","top":"garment fabric color #hex","bottom":"garment fabric color #hex","shoes":"shoe material color","accessories":["item1","item2"],"colors":["#hex1","#hex2","#hex3"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
            },
          ],
        },
      ]);
      outfits = JSON.parse(extractText(data).replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Outfits failed:", err);
      outfits = getMockOutfits();
    }

    // ═══════════════════════════════════════════════
    // STEP 3: Edit photo with each outfit
    // gpt-4o + image_generation tool
    // ═══════════════════════════════════════════════
    console.log("Step 3: Editing photos...");

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        try {
          console.log(`  Outfit ${i + 1}/3: ${outfit.name}...`);

          const prompt = `CRITICAL INSTRUCTION: FACE CONSISTENCY & IDENTITY PRESERVATION

You are receiving a real photograph of a specific person. You must return the EXACT SAME photograph with ONLY the clothing changed.

IDENTITY PRESERVATION (highest priority):
- The person's face is their IDENTITY. Every pixel of their face must be preserved: exact same eyes, eye color, eye shape, eyebrows, nose, nostrils, lips, mouth shape, jawline, chin, cheekbones, forehead, ears, facial hair, wrinkles, moles, freckles, skin texture.
- Their head shape, hair style, hair color, hair volume, hairline — all identical.
- Their skin tone across the entire body — identical.
- Their body proportions, weight, muscle definition — identical.
- Their exact pose, posture, stance, arm angle, hand position, finger placement — identical.
- Any items they are holding or wearing that are NOT clothing (phone, glasses, watch) — keep them.

BACKGROUND PRESERVATION:
- The environment, walls, floor, objects, lighting direction, shadow angles, color temperature, reflections — all identical. Not similar. Identical.

CLOTHING CHANGES (the ONLY thing you modify):
- Replace their current top/shirt with: ${outfit.top}
- Replace their current bottom/pants with: ${outfit.bottom}
- Replace their footwear with: ${outfit.shoes}

ACCESSORIES TO ADD:
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- None"}

The new clothing must fit their exact body shape with realistic fabric draping, wrinkles, and shadows that match the existing lighting. The final result must look like the original unedited photo — as if the person was actually wearing these clothes when the picture was taken.

REMEMBER: If the face changes even 1%, the entire output is a failure. Face identity = #1 priority.`;

          const data = await callResponses(
            apiKey,
            [
              {
                role: "user",
                content: [
                  { type: "input_image", image_url: imageDataUrl },
                  { type: "input_text", text: prompt },
                ],
              },
            ],
            [{ type: "image_generation", quality: "high", size: "1024x1024" }]
          );

          const image = extractImage(data);
          console.log(`  ${image ? "✅" : "❌"} Outfit ${i + 1}/3`);
          return image;
        } catch (err: any) {
          console.error(`  Failed ${i + 1}/3:`, err?.message?.substring(0, 300) || err);
          return null;
        }
      })
    );

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

    console.log("Done!");

    return NextResponse.json({
      success: true,
      mode: "gpt-4o",
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
    console.error("Error:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Generation failed" }, { status: 500 });
  }
}

function getMockAnalysis() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}

function getMockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater (#1B2A4A)", bottom: "Beige chinos (#D2B48C)", shoes: "Brown loafers", accessories: ["Gold watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Business casual", generatedImage: null },
    { name: "Trendy Bold", description: "Fashion-forward", top: "Olive shirt (#556B2F)", bottom: "Black trousers (#1A1A1A)", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "High-end", top: "Burgundy turtleneck (#722F37)", bottom: "Charcoal pants (#36454F)", shoes: "Oxford brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
