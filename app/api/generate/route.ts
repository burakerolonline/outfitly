import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

// ═══════════════════════════════════════════════════════
// AI OUTFIT GENERATOR — Same method as ChatGPT
//
//   1. GPT-4o Vision  → analyze your photo
//   2. GPT-4o         → recommend outfits
//   3. gpt-image-1    → edit YOUR photo (keeps face, changes clothes)
//
// Only needs: OPENAI_API_KEY
// ═══════════════════════════════════════════════════════

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export const maxDuration = 120; // Allow up to 2 min for image generation

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
    console.log("🔍 Step 1: Analyzing photo...");

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
                text: `Analyze this person for fashion styling. Respond ONLY valid JSON, no markdown:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","distinctFeatures":"glasses, beard, etc or none","confidence":95}`,
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
    console.log("👔 Step 2: Generating outfit ideas...");

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
            content: `You are a world-class stylist.\n\nPERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone} undertone), ${analysis.hairColor} hair, ${analysis.bodyType}. ${analysis.distinctFeatures || ""}\nSTYLE: ${styleLabels[style] || style}\n${productUrl ? `MUST INCLUDE: ${productUrl}` : ""}\n\nGenerate 3 outfits. Respond ONLY with a JSON array, no markdown:\n[\n  {\n    "name": "Safe Stylish",\n    "description": "one line description",\n    "top": "garment, fabric, color + hex",\n    "bottom": "garment, fabric, color + hex",\n    "shoes": "shoe, material, color",\n    "accessories": ["item1", "item2", "item3"],\n    "colors": ["#hex1", "#hex2", "#hex3"],\n    "occasion": "where to wear"\n  },\n  { "name": "Trendy Bold", ... },\n  { "name": "Premium Luxury", ... }\n]`,
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
    // Same method as ChatGPT — keeps face, changes clothes
    // Uses OpenAI SDK which handles encoding properly
    // ═══════════════════════════════════════════════
    console.log("🎨 Step 3: Editing your photo with outfits...");

    // Convert base64 to a file the SDK can handle
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");
    const imageFile = await toFile(imageBuffer, "photo.png", {
      type: "image/png",
    });

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        try {
          const editPrompt = `Edit this photo of a real person. Keep their EXACT same face, hair, skin tone, pose, and background completely unchanged. ONLY replace their clothing with this new outfit:

Top: ${outfit.top}
Bottom: ${outfit.bottom}
Shoes: ${outfit.shoes}
Accessories: ${outfit.accessories?.join(", ") || "none"}

The result must look like a natural, real photograph. The person's identity must remain exactly the same. Only the clothing changes.`;

          console.log(`  Editing outfit ${i + 1}/3: ${outfit.name}...`);

          // Use OpenAI SDK — handles all encoding correctly
          const response = await client.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: editPrompt,
            n: 1,
            size: "1024x1024",
          });

          // Get the result — SDK returns b64_json or url
          const result = response.data?.[0];
          if (result?.b64_json) {
            console.log(`  ✅ Outfit ${i + 1} done (base64)`);
            return `data:image/png;base64,${result.b64_json}`;
          }
          if (result?.url) {
            console.log(`  ✅ Outfit ${i + 1} done (url)`);
            return result.url;
          }

          console.log(`  ⚠️ Outfit ${i + 1} no image returned`);
          return null;
        } catch (err: any) {
          console.error(`  ❌ Outfit ${i + 1} failed:`, err?.message || err);
          return null;
        }
      })
    );

    // Build final response
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

    console.log("✅ All done!");

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
    console.error("❌ Error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Generation failed" },
      { status: 500 }
    );
  }
}

// ─── Mock data (when no API key) ─────────────────────
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
