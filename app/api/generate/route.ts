import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// POST /api/generate
//
// PIPELINE:
//   1. GPT-4o Vision  → analyze user photo
//   2. GPT-4o         → generate outfit descriptions
//   3. DALL-E 3       → generate outfit images (3x)
//
// Requires: OPENAI_API_KEY in environment variables
// ═══════════════════════════════════════════════════════

const OPENAI_URL = "https://api.openai.com/v1";

async function callGPT(apiKey: string, messages: any[], maxTokens = 1000, temperature = 0.5) {
  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GPT error: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function generateImage(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${OPENAI_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "natural",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("DALL-E error:", err);
    throw new Error(`DALL-E error: ${err}`);
  }
  const data = await res.json();
  return data.data?.[0]?.url || "";
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
      console.warn("No OPENAI_API_KEY — returning mock data");
      return NextResponse.json({ success: true, analysis: getMockAnalysis(), outfits: getMockOutfits(style) });
    }

    // ═════════════════════════════════════════════════
    // STEP 1: GPT-4o Vision — Analyze User Photo
    // ═════════════════════════════════════════════════
    console.log("Step 1: Analyzing photo with GPT-4o Vision...");

    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    const analysisText = await callGPT(apiKey, [{
      role: "user",
      content: [
        {
          type: "text",
          text: `You are an expert fashion analyst. Analyze this person's photo.

Detect:
- skinTone: Light / Medium / Olive / Dark
- undertone: Warm / Cool / Neutral
- faceShape: Oval / Round / Square / Heart / Oblong
- bodyType: Ectomorph / Mesomorph / Endomorph / Athletic
- hairColor: describe color
- gender: Male / Female
- age: approximate age range (e.g. "25-30")
- additionalNotes: any style-relevant observations (glasses, beard, etc.)

Respond ONLY with valid JSON, no markdown:
{"skinTone":"...","undertone":"...","faceShape":"...","bodyType":"...","hairColor":"...","gender":"...","age":"...","additionalNotes":"...","confidence":95}`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }], 500, 0.3);

    let analysis;
    try {
      analysis = JSON.parse(analysisText.replace(/```json|```/g, "").trim());
    } catch {
      console.error("Analysis parse failed:", analysisText);
      analysis = getMockAnalysis();
    }

    // ═════════════════════════════════════════════════
    // STEP 2: GPT-4o — Generate Outfit Descriptions
    // ═════════════════════════════════════════════════
    console.log("Step 2: Generating outfit descriptions...");

    const styleMap: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury (Ralph Lauren, Brunello Cucinelli, Loro Piana). Timeless, no logos, cashmere, wool, earth tones.",
      streetwear: "Streetwear / Urban (Nike, Off-White, Jordan). Bold graphics, oversized, sneaker culture.",
      minimal: "Minimalist / Scandinavian (COS, Acne Studios, Jil Sander). Clean lines, neutrals, structure.",
      "smart-casual": "Smart Casual (Massimo Dutti, Reiss). Polished but relaxed, chinos, loafers.",
      luxury: "High Luxury (Tom Ford, Gucci, Saint Laurent). Premium materials, statement pieces.",
      sport: "Sport / Athleisure (Nike Tech, Lululemon). Performance fabrics, sleek silhouettes.",
    };

    const outfitText = await callGPT(apiKey, [{
      role: "user",
      content: `You are a world-class fashion stylist.

PERSON:
- Gender: ${analysis.gender || "Unknown"}
- Age: ${analysis.age || "25-35"}
- Skin: ${analysis.skinTone}, ${analysis.undertone} undertone
- Face: ${analysis.faceShape}
- Body: ${analysis.bodyType}
- Hair: ${analysis.hairColor}
- Notes: ${analysis.additionalNotes || "none"}

STYLE: ${styleMap[style] || style}
${productUrl ? `MUST INCLUDE THIS PRODUCT: ${productUrl}` : ""}

COLOR RULES for ${analysis.undertone} undertone:
${analysis.undertone === "Warm" ? "Best: earth tones, camel, olive, rust, burgundy, gold jewelry. Avoid: icy blues, stark white." :
  analysis.undertone === "Cool" ? "Best: jewel tones, navy, emerald, sapphire, silver jewelry. Avoid: orange, warm yellow." :
  "Versatile: both warm and cool work. Mixed metals. Wide range of colors."}

Generate exactly 3 outfits. Respond ONLY with a JSON array (no markdown):
[
  {
    "name": "Safe Stylish",
    "description": "one-line description of this look",
    "top": "specific garment, fabric, fit, color name + hex",
    "bottom": "specific garment, fabric, fit, color name + hex",
    "shoes": "specific shoe, material, color",
    "accessories": ["item1", "item2", "item3"],
    "colors": ["#hex1", "#hex2", "#hex3"],
    "occasion": "where to wear",
    "imagePrompt": "detailed prompt to generate this outfit on a ${analysis.gender || 'person'}, ${analysis.age || '25-30'} years old, ${analysis.skinTone} skin, ${analysis.hairColor} hair, full body shot, fashion photography, studio lighting"
  },
  { "name": "Trendy Bold", ... },
  { "name": "Premium Luxury", ... }
]

CRITICAL: The "imagePrompt" must be extremely detailed and describe the FULL outfit visually for image generation. Include: exact clothing items, colors, fabrics, styling details, model description matching the user, photography style.`,
    }], 2500, 0.7);

    let outfits;
    try {
      outfits = JSON.parse(outfitText.replace(/```json|```/g, "").trim());
    } catch {
      console.error("Outfits parse failed:", outfitText);
      outfits = getMockOutfits(style);
    }

    // ═════════════════════════════════════════════════
    // STEP 3: DALL-E 3 — Generate Outfit Images
    // ═════════════════════════════════════════════════
    console.log("Step 3: Generating outfit images with DALL-E 3...");

    const imagePromises = outfits.map(async (outfit: any, index: number) => {
      try {
        // Build a rich image prompt
        const prompt = outfit.imagePrompt ||
          `Fashion photography, full body shot of a ${analysis.gender || "person"}, ${analysis.age || "25-30"} years old, ${analysis.skinTone} skin tone, ${analysis.hairColor} hair. Wearing: ${outfit.top}, ${outfit.bottom}, ${outfit.shoes}. Accessories: ${outfit.accessories?.join(", ") || "none"}. Style: ${styleMap[style] || style}. Professional studio lighting, high fashion magazine quality, photorealistic, elegant pose, clean background.`;

        // Safety prefix to ensure quality
        const safePrompt = `High-end fashion editorial photograph. ${prompt} Shot on medium format camera, soft professional lighting, neutral studio background, 8k quality, ultra detailed clothing textures.`;

        console.log(`Generating image ${index + 1}/3...`);
        const imageUrl = await generateImage(apiKey, safePrompt);
        return imageUrl;
      } catch (err) {
        console.error(`Image generation failed for outfit ${index + 1}:`, err);
        return null;
      }
    });

    const generatedImages = await Promise.all(imagePromises);

    // Attach images to outfits
    const outfitsWithImages = outfits.map((outfit: any, i: number) => ({
      name: outfit.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
      description: outfit.description || "",
      top: outfit.top || "Not specified",
      bottom: outfit.bottom || "Not specified",
      shoes: outfit.shoes || "Not specified",
      accessories: outfit.accessories || [],
      colors: outfit.colors || ["#333", "#666", "#999"],
      occasion: outfit.occasion || "",
      generatedImage: generatedImages[i] || null,
    }));

    console.log("Done! Returning results.");

    return NextResponse.json({
      success: true,
      analysis: {
        skinTone: analysis.skinTone || "Medium",
        undertone: analysis.undertone || "Neutral",
        faceShape: analysis.faceShape || "Oval",
        bodyType: analysis.bodyType || "Mesomorph",
        hairColor: analysis.hairColor || "Brown",
        gender: analysis.gender || "Unknown",
        confidence: analysis.confidence || "90",
      },
      outfits: outfitsWithImages,
    });
  } catch (error: any) {
    console.error("Generation error:", error);
    return NextResponse.json({ error: error.message || "Generation failed" }, { status: 500 });
  }
}

// ─── FALLBACK MOCK DATA ────────────────────────────
function getMockAnalysis() {
  return {
    skinTone: ["Light", "Medium", "Olive", "Dark"][Math.floor(Math.random() * 4)],
    undertone: ["Warm", "Cool", "Neutral"][Math.floor(Math.random() * 3)],
    faceShape: ["Oval", "Round", "Square", "Heart"][Math.floor(Math.random() * 4)],
    bodyType: ["Ectomorph", "Mesomorph", "Athletic"][Math.floor(Math.random() * 3)],
    hairColor: "Brown",
    gender: "Male",
    confidence: "92",
  };
}

function getMockOutfits(style: string) {
  return [
    { name: "Safe Stylish", description: "Classic and universally flattering", top: "Navy cashmere sweater (#1B2A4A)", bottom: "Beige tailored chinos (#D2B48C)", shoes: "Brown suede loafers", accessories: ["Gold watch", "Leather belt"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Business casual", generatedImage: null },
    { name: "Trendy Bold", description: "Fashion-forward statement", top: "Olive oversized shirt (#556B2F)", bottom: "Black wide-leg trousers (#1A1A1A)", shoes: "White chunky sneakers", accessories: ["Chain necklace", "Sunglasses"], colors: ["#556B2F", "#1A1A1A", "#FFFFFF"], occasion: "Weekend outing", generatedImage: null },
    { name: "Premium Luxury", description: "High-end designer quality", top: "Burgundy merino turtleneck (#722F37)", bottom: "Charcoal wool dress pants (#36454F)", shoes: "Cognac Oxford brogues", accessories: ["Silk pocket square", "Cufflinks"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Upscale dinner", generatedImage: null },
  ];
}
