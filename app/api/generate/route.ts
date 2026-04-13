import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// AI OUTFIT GENERATOR — Same method as ChatGPT
//
// PIPELINE:
//   1. GPT-4o Vision  → analyze user photo
//   2. GPT-4o         → recommend outfits
//   3. gpt-image-1    → edit YOUR photo with each outfit
//                       (keeps your face, body, pose — only changes clothes)
//
// Only needs: OPENAI_API_KEY
// ═══════════════════════════════════════════════════════

const OPENAI_URL = "https://api.openai.com/v1";

// ─── Helper: Call GPT-4o ─────────────────────────────
async function callGPT(apiKey: string, messages: any[], maxTokens = 1000, temp = 0.5) {
  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages, max_tokens: maxTokens, temperature: temp }),
  });
  if (!res.ok) throw new Error(`GPT error: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Helper: Edit photo with gpt-image-1 ────────────
// This is the same method ChatGPT uses to edit your photo
async function editPhoto(apiKey: string, imageBase64: string, prompt: string): Promise<string | null> {
  try {
    // Strip data URL prefix to get raw base64
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");

    // Create form data with the image
    const formData = new FormData();
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("image", imageBlob, "photo.png");
    formData.append("model", "gpt-image-1");
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");
    formData.append("quality", "high");

    const res = await fetch(`${OPENAI_URL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("gpt-image-1 edit error:", errText);

      // Fallback: try with dall-e-2 edits endpoint
      console.log("Trying dall-e-2 fallback...");
      return await editPhotoFallback(apiKey, imageBuffer, prompt);
    }

    const data = await res.json();

    // Response may contain b64_json or url
    if (data.data?.[0]?.b64_json) {
      return `data:image/png;base64,${data.data[0].b64_json}`;
    }
    return data.data?.[0]?.url || null;
  } catch (err) {
    console.error("Photo edit error:", err);
    return null;
  }
}

// ─── Fallback: DALL-E 2 edit ─────────────────────────
async function editPhotoFallback(apiKey: string, imageBuffer: Buffer, prompt: string): Promise<string | null> {
  try {
    const formData = new FormData();
    const imageBlob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("image", imageBlob, "photo.png");
    formData.append("model", "dall-e-2");
    formData.append("prompt", prompt);
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    const res = await fetch(`${OPENAI_URL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      console.error("dall-e-2 fallback error:", await res.text());
      return null;
    }

    const data = await res.json();
    if (data.data?.[0]?.b64_json) {
      return `data:image/png;base64,${data.data[0].b64_json}`;
    }
    return data.data?.[0]?.url || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════
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

    const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    // ═════════════════════════════════════════════════
    // STEP 1: GPT-4o Vision → Analyze Photo
    // ═════════════════════════════════════════════════
    console.log("🔍 Step 1: Analyzing photo...");

    const analysisText = await callGPT(apiKey, [{
      role: "user",
      content: [
        {
          type: "text",
          text: `Analyze this person for fashion styling. Respond ONLY valid JSON:
{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","distinctFeatures":"glasses, beard, etc or none","confidence":95}`,
        },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }], 400, 0.3);

    let analysis;
    try {
      analysis = JSON.parse(analysisText.replace(/```json|```/g, "").trim());
    } catch {
      analysis = getMockAnalysis();
    }

    // ═════════════════════════════════════════════════
    // STEP 2: GPT-4o → Outfit Recommendations
    // ═════════════════════════════════════════════════
    console.log("👔 Step 2: Generating outfit ideas...");

    const styleMap: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury (Ralph Lauren, Brunello Cucinelli)",
      streetwear: "Streetwear / Urban (Nike, Off-White, Jordan)",
      minimal: "Minimalist (COS, Acne Studios, Jil Sander)",
      "smart-casual": "Smart Casual (Massimo Dutti, Reiss)",
      luxury: "High Luxury (Tom Ford, Gucci, Saint Laurent)",
      sport: "Athleisure (Nike Tech, Lululemon)",
    };

    const outfitText = await callGPT(apiKey, [{
      role: "user",
      content: `You are a world-class stylist.

PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone} undertone), ${analysis.hairColor} hair, ${analysis.bodyType} build. ${analysis.distinctFeatures || ""}

STYLE: ${styleMap[style] || style}
${productUrl ? `MUST INCLUDE: ${productUrl}` : ""}

COLOR RULES for ${analysis.undertone} undertone:
${analysis.undertone === "Warm" ? "Best: earth tones, camel, olive, rust, gold" : analysis.undertone === "Cool" ? "Best: jewel tones, navy, emerald, silver" : "Versatile: both warm and cool work"}

Generate 3 outfits. Respond ONLY with JSON array:
[
  {
    "name": "Safe Stylish",
    "description": "one line look description",
    "top": "garment, fabric, color with hex",
    "bottom": "garment, fabric, color with hex",
    "shoes": "shoe style, material, color",
    "accessories": ["item1", "item2", "item3"],
    "colors": ["#hex1", "#hex2", "#hex3"],
    "occasion": "where to wear"
  },
  { "name": "Trendy Bold", ... },
  { "name": "Premium Luxury", ... }
]`,
    }], 2000, 0.7);

    let outfits;
    try {
      outfits = JSON.parse(outfitText.replace(/```json|```/g, "").trim());
    } catch {
      outfits = [
        { name: "Safe Stylish", description: "", top: "N/A", bottom: "N/A", shoes: "N/A", accessories: [], colors: ["#333","#666","#999"], occasion: "" },
        { name: "Trendy Bold", description: "", top: "N/A", bottom: "N/A", shoes: "N/A", accessories: [], colors: ["#333","#666","#999"], occasion: "" },
        { name: "Premium Luxury", description: "", top: "N/A", bottom: "N/A", shoes: "N/A", accessories: [], colors: ["#333","#666","#999"], occasion: "" },
      ];
    }

    // ═════════════════════════════════════════════════
    // STEP 3: gpt-image-1 → Edit YOUR photo with outfits
    // Same method ChatGPT uses — keeps your face, changes clothes
    // ═════════════════════════════════════════════════
    console.log("🎨 Step 3: Editing your photo with outfits (gpt-image-1)...");

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        const editPrompt = `Edit this photo. Keep the EXACT same person, same face, same pose, same background, same lighting. ONLY change their clothes.

Replace their current outfit with:
- Top: ${outfit.top}
- Bottom: ${outfit.bottom}  
- Shoes: ${outfit.shoes}
- Accessories: ${outfit.accessories?.join(", ") || "none"}

The new outfit must look completely natural and photorealistic on this person. Do NOT change their face, hair, skin, body shape, or background. Only the clothing changes.`;

        console.log(`  Editing outfit ${i + 1}/3: ${outfit.name}...`);

        try {
          const result = await editPhoto(apiKey, imageBase64, editPrompt);
          console.log(`  ✅ Outfit ${i + 1} done`);
          return result;
        } catch (err) {
          console.error(`  ❌ Outfit ${i + 1} failed:`, err);
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
      generatedImage: editResults[i],
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
    console.error("❌ Error:", error);
    return NextResponse.json({ error: error.message || "Generation failed" }, { status: 500 });
  }
}

// ─── Mock data ───────────────────────────────────────
function getMockAnalysis() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}
function getMockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic and flattering", top: "Navy sweater (#1B2A4A)", bottom: "Beige chinos (#D2B48C)", shoes: "Brown loafers", accessories: ["Gold watch", "Belt"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Business casual", generatedImage: null },
    { name: "Trendy Bold", description: "Fashion-forward", top: "Olive shirt (#556B2F)", bottom: "Black trousers (#1A1A1A)", shoes: "White sneakers", accessories: ["Chain", "Sunglasses"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "High-end quality", top: "Burgundy turtleneck (#722F37)", bottom: "Charcoal pants (#36454F)", shoes: "Oxford brogues", accessories: ["Pocket square", "Cufflinks"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
