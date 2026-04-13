import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

// ═══════════════════════════════════════════════════════
// gpt-4o      → analiz + kıyafet önerisi (text)
// gpt-image-1 → fotoğraf düzenleme (ChatGPT'nin aynı motoru)
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, style, productUrl } = body;

    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Missing image or style" }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
      return NextResponse.json({ success: true, mode: "mock", analysis: getMockAnalysis(), outfits: getMockOutfits() });
    }

    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // ═══════════════════════════════════════════════
    // STEP 1: gpt-4o → Analyze photo
    // ═══════════════════════════════════════════════
    console.log("Step 1: Analyzing...");

    let analysis;
    try {
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 400,
        temperature: 0.3,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: 'Analyze this person for fashion styling. Respond ONLY valid JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","confidence":95}' },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        }],
      });
      const raw = res.choices[0]?.message?.content || "";
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Analysis error:", err);
      analysis = getMockAnalysis();
    }

    // ═══════════════════════════════════════════════
    // STEP 2: gpt-4o → Outfit suggestions
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
      const res = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{
          role: "user",
          content: `World-class stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone}), ${analysis.hairColor} hair, ${analysis.bodyType}.\nSTYLE: ${styleLabels[style] || style}\n${productUrl ? "INCLUDE: " + productUrl : ""}\n\n3 outfits. ONLY JSON array:\n[{"name":"Safe Stylish","description":"...","top":"garment fabric color #hex","bottom":"garment fabric color #hex","shoes":"shoe material color","accessories":["item1","item2"],"colors":["#hex1","#hex2","#hex3"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
        }],
      });
      const raw = res.choices[0]?.message?.content || "";
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Outfits error:", err);
      outfits = getMockOutfits();
    }

    // ═══════════════════════════════════════════════
    // STEP 3: gpt-image-1 → Edit YOUR photo
    // ═══════════════════════════════════════════════
    console.log("Step 3: Editing photos...");

    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");
    const imageFile = await toFile(imageBuffer, "photo.png", { type: "image/png" });

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        try {
          console.log(`  Outfit ${i + 1}/3: ${outfit.name}...`);

          const prompt = `CRITICAL INSTRUCTION: FACE CONSISTENCY & IDENTITY PRESERVATION

You are editing a real photograph of a specific person. You must return the EXACT SAME photograph with ONLY the clothing changed.

IDENTITY PRESERVATION (highest priority):
- The person's face is their IDENTITY. Every pixel of their face must be preserved: exact same eyes, eye color, eye shape, eyebrows, nose, nostrils, lips, mouth shape, jawline, chin, cheekbones, forehead, ears, facial hair, wrinkles, moles, freckles, skin texture.
- Their head shape, hair style, hair color, hair volume, hairline — all identical.
- Their skin tone across the entire body — identical.
- Their body proportions, weight, muscle definition — identical.
- Their exact pose, posture, stance, arm angle, hand position, finger placement — identical.
- Any items they are holding or wearing that are NOT clothing (phone, glasses, watch) — keep them exactly as they are.

BACKGROUND PRESERVATION:
- The environment, walls, floor, objects, lighting direction, shadow angles, color temperature, reflections — all identical. Not similar. IDENTICAL.

CLOTHING CHANGES (the ONLY thing you modify):
- Replace their current top/shirt with: ${outfit.top}
- Replace their current bottom/pants with: ${outfit.bottom}
- Replace their footwear with: ${outfit.shoes}

ACCESSORIES TO ADD (place naturally on the person):
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- None"}

The new clothing must fit their exact body shape with realistic fabric draping, wrinkles, and shadows matching the existing lighting. The result must look like the original unedited photo — as if the person was wearing these clothes when the picture was taken.

REMEMBER: If the face changes even 1%, the entire output is a failure. Face identity = #1 priority.`;

          const response = await client.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: prompt,
            n: 1,
            size: "1024x1024",
          });

          const result = response.data?.[0];
          if (result?.b64_json) {
            console.log(`  ✅ ${i + 1}/3 done`);
            return `data:image/png;base64,${result.b64_json}`;
          }
          if (result?.url) {
            console.log(`  ✅ ${i + 1}/3 done`);
            return result.url;
          }
          console.log(`  ⚠️ ${i + 1}/3 no image returned`);
          return null;
        } catch (err: any) {
          console.error(`  ❌ ${i + 1}/3 failed:`, err?.message || err);
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
      mode: "gpt-image-1",
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
