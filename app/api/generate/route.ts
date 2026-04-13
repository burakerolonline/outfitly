import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, style, productUrl } = body;

    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Missing image or style" }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
      return NextResponse.json({
        success: true,
        mode: "mock",
        analysis: getMockAnalysis(),
        outfits: getMockOutfits(),
      });
    }

    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // ═══════════════════════════════════════════════
    // STEP 1: GPT-4o Vision → Analyze Photo
    // ═══════════════════════════════════════════════
    console.log("Step 1: Analyzing photo...");

    let analysis;
    try {
      const analysisRes = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Analyze this person for fashion styling. Respond ONLY valid JSON, no markdown:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","distinctFeatures":"glasses, beard, etc or none","confidence":95}',
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      });

      const raw = analysisRes.choices[0]?.message?.content || "";
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Analysis error:", err);
      analysis = getMockAnalysis();
    }

    // ═══════════════════════════════════════════════
    // STEP 2: GPT-4o → Outfit Recommendations
    // ═══════════════════════════════════════════════
    console.log("Step 2: Generating outfit ideas...");

    const styleLabels: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury",
      streetwear: "Streetwear / Urban",
      minimal: "Minimalist / Scandinavian",
      "smart-casual": "Smart Casual",
      luxury: "High Luxury / Designer",
      sport: "Athleisure / Sporty",
    };

    let outfits;
    try {
      const outfitRes = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          {
            role: "user",
            content: `You are a world-class stylist.

PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone} undertone), ${analysis.hairColor} hair, ${analysis.bodyType}. ${analysis.distinctFeatures || ""}
STYLE: ${styleLabels[style] || style}
${productUrl ? "MUST INCLUDE: " + productUrl : ""}

Generate 3 outfits. Respond ONLY with a JSON array, no markdown:
[
  {
    "name": "Safe Stylish",
    "description": "one line description",
    "top": "garment, fabric, color + hex",
    "bottom": "garment, fabric, color + hex",
    "shoes": "shoe, material, color",
    "accessories": ["item1", "item2", "item3"],
    "colors": ["#hex1", "#hex2", "#hex3"],
    "occasion": "where to wear"
  },
  { "name": "Trendy Bold", ... },
  { "name": "Premium Luxury", ... }
]`,
          },
        ],
      });

      const raw = outfitRes.choices[0]?.message?.content || "";
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Outfit generation error:", err);
      outfits = getMockOutfits();
    }

    // ═══════════════════════════════════════════════
    // STEP 3: gpt-image-1 → Edit YOUR photo
    // ═══════════════════════════════════════════════
    console.log("Step 3: Editing your photo with outfits...");

    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");
    const imageFile = await toFile(imageBuffer, "photo.png", {
      type: "image/png",
    });

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        try {
          const editPrompt = `You are editing a real photograph of a person. This is a strict photo edit, not an artistic creation.

ABSOLUTE RULES — NEVER VIOLATE:
- The person's face must remain IDENTICAL: same eyes, nose, mouth, jawline, eyebrows, facial hair, expression. Not similar — IDENTICAL.
- Their hairstyle, hair color, and head must remain completely untouched.
- Their skin tone, body shape, weight, and proportions stay exactly the same.
- Their pose, stance, arm positions, hand positions remain frozen as-is.
- Any objects they hold (phone, bag, keys) remain exactly where they are.
- The background, environment, lighting, shadows, and camera angle are LOCKED — zero changes.

WHAT TO CHANGE — CLOTHING ONLY:
- Remove their current top/shirt and replace with: ${outfit.top}
- Remove their current pants/bottom and replace with: ${outfit.bottom}
- Replace their footwear with: ${outfit.shoes}

ACCESSORIES TO ADD (place naturally on the person):
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- None"}

The new clothes must wrap around the person's exact body shape realistically. Fabric folds, shadows, and fit must match the pose. The final image must be indistinguishable from a real photograph.`;

          console.log(`  Editing outfit ${i + 1}/3: ${outfit.name}...`);

          const response = await client.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: editPrompt,
            n: 1,
            size: "1024x1024",
          });

          const result = response.data?.[0];
          if (result?.b64_json) {
            console.log(`  Done ${i + 1}/3`);
            return `data:image/png;base64,${result.b64_json}`;
          }
          if (result?.url) {
            console.log(`  Done ${i + 1}/3`);
            return result.url;
          }

          return null;
        } catch (err: any) {
          console.error(`  Failed ${i + 1}/3:`, err?.message || err);
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

    console.log("All done!");

    return NextResponse.json({
      success: true,
      mode: "photo-edit",
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
    return NextResponse.json(
      { error: error?.message || "Generation failed" },
      { status: 500 }
    );
  }
}

function getMockAnalysis() {
  return {
    skinTone: "Medium",
    undertone: "Warm",
    faceShape: "Oval",
    bodyType: "Mesomorph",
    hairColor: "Brown",
    gender: "Male",
    confidence: "92",
  };
}

function getMockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic and flattering", top: "Navy sweater (#1B2A4A)", bottom: "Beige chinos (#D2B48C)", shoes: "Brown loafers", accessories: ["Gold watch", "Belt"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Business casual", generatedImage: null },
    { name: "Trendy Bold", description: "Fashion-forward", top: "Olive shirt (#556B2F)", bottom: "Black trousers (#1A1A1A)", shoes: "White sneakers", accessories: ["Chain", "Sunglasses"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "High-end quality", top: "Burgundy turtleneck (#722F37)", bottom: "Charcoal pants (#36454F)", shoes: "Oxford brogues", accessories: ["Pocket square", "Cufflinks"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
