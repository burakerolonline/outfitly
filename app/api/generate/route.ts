import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";

// ═══════════════════════════════════════════════════════
// Yöntem 1 (öncelikli): Responses API + image_generation
//   → ChatGPT'nin yöntemi, yüzü en iyi koruyan
// Yöntem 2 (yedek): images.edit + gpt-image-1
//   → Çalıştığı kanıtlanmış, yüz koruması daha zayıf
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// ─── Yöntem 1: Responses API (ChatGPT'nin kullandığı) ───
async function editWithResponsesAPI(
  client: OpenAI,
  imageDataUrl: string,
  prompt: string
): Promise<string | null> {
  try {
    // @ts-ignore - responses API may not be in older type definitions
    const response = await client.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: imageDataUrl },
            { type: "input_text", text: prompt },
          ],
        },
      ],
      tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
    });

    // Response'dan image'ı çıkar
    const output = response?.output;
    if (!output || !Array.isArray(output)) {
      console.log("  Responses API: no output array");
      return null;
    }

    for (const block of output) {
      // Direkt image_generation_call bloğu
      if (block.type === "image_generation_call" && block.result) {
        console.log("  Responses API: found image_generation_call");
        return `data:image/png;base64,${block.result}`;
      }
      // Message içinde nested
      if (block.type === "message" && block.content) {
        for (const content of block.content) {
          if (content.type === "image" && content.image_url) {
            console.log("  Responses API: found image in message");
            return content.image_url;
          }
          if (content.type === "image_generation_call" && content.result) {
            console.log("  Responses API: found image_generation_call in message");
            return `data:image/png;base64,${content.result}`;
          }
        }
      }
    }

    console.log("  Responses API: image not found in output. Keys:", JSON.stringify(output.map((b: any) => b.type)));
    return null;
  } catch (err: any) {
    console.error("  Responses API error:", err?.message?.substring(0, 300) || err);
    return null;
  }
}

// ─── Yöntem 2: images.edit (yedek) ───
async function editWithImagesAPI(
  client: OpenAI,
  imageFile: any,
  prompt: string
): Promise<string | null> {
  try {
    const response = await client.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });

    const result = response.data?.[0];
    if (result?.b64_json) return `data:image/png;base64,${result.b64_json}`;
    if (result?.url) return result.url;
    return null;
  } catch (err: any) {
    console.error("  Images API error:", err?.message?.substring(0, 300) || err);
    return null;
  }
}

// ─── Yüz koruma prompt'u oluştur ───
function buildEditPrompt(outfit: any, analysis: any): string {
  return `CRITICAL: FACE & IDENTITY PRESERVATION

You are editing a real photograph. The person in this photo has these EXACT features that MUST NOT change:
- Gender: ${analysis.gender}
- Age: approximately ${analysis.age}
- Skin tone: ${analysis.skinTone} with ${analysis.undertone} undertone
- Hair: ${analysis.hairColor}
- Face shape: ${analysis.faceShape}
- Body type: ${analysis.bodyType}

ABSOLUTE RULES:
- Every pixel of their face must remain IDENTICAL: eyes, nose, mouth, jawline, eyebrows, facial hair, skin texture, moles, freckles — everything.
- Hair style, color, volume, hairline — IDENTICAL.
- Body shape, proportions, weight, muscle definition — IDENTICAL.
- Pose, posture, arm angles, hand positions, finger placement — IDENTICAL.
- Objects they hold (phone, bag) — keep exactly as they are.
- Background, environment, lighting, shadows, reflections — IDENTICAL.

ONLY CHANGE CLOTHING:
- Top: ${outfit.top}
- Bottom: ${outfit.bottom}
- Shoes: ${outfit.shoes}

ADD THESE ACCESSORIES:
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- None"}

The clothing must wrap naturally around their body with realistic fabric physics. The result must be indistinguishable from the original photo — as if the person was actually wearing these clothes.

If the face changes even 1%, the output is a FAILURE. Identity preservation is the #1 priority.`;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════
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

    // ═══ STEP 1: Analyze ═══
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
            { type: "text", text: 'Analyze this person for fashion styling. Respond ONLY valid JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        }],
      });
      analysis = JSON.parse((res.choices[0]?.message?.content || "").replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Analysis error:", err);
      analysis = getMockAnalysis();
    }

    // ═══ STEP 2: Outfits ═══
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
      outfits = JSON.parse((res.choices[0]?.message?.content || "").replace(/```json|```/g, "").trim());
    } catch (err) {
      console.error("Outfits error:", err);
      outfits = getMockOutfits();
    }

    // ═══ STEP 3: Edit photos ═══
    console.log("Step 3: Editing photos...");

    // images.edit için dosya hazırla
    const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Clean, "base64");
    const imageFile = await toFile(imageBuffer, "photo.png", { type: "image/png" });

    // Önce Responses API'yi test et (ilk outfit ile)
    console.log("  Testing Responses API...");
    const testPrompt = buildEditPrompt(outfits[0], analysis);
    const testResult = await editWithResponsesAPI(client, imageDataUrl, testPrompt);
    const useResponsesAPI = testResult !== null;
    console.log(`  Responses API ${useResponsesAPI ? "✅ WORKS" : "❌ FAILED, using images.edit fallback"}`);

    let editResults: (string | null)[];

    if (useResponsesAPI) {
      // Responses API çalışıyor — tüm outfitler için kullan
      editResults = [testResult];
      const remaining = await Promise.all(
        outfits.slice(1).map(async (outfit: any, i: number) => {
          console.log(`  Outfit ${i + 2}/3: ${outfit.name} (Responses API)...`);
          const prompt = buildEditPrompt(outfit, analysis);
          const result = await editWithResponsesAPI(client, imageDataUrl, prompt);
          console.log(`  ${result ? "✅" : "❌"} ${i + 2}/3`);
          return result;
        })
      );
      editResults.push(...remaining);
    } else {
      // images.edit fallback — tüm outfitler
      editResults = await Promise.all(
        outfits.map(async (outfit: any, i: number) => {
          console.log(`  Outfit ${i + 1}/3: ${outfit.name} (images.edit)...`);
          const prompt = buildEditPrompt(outfit, analysis);
          const result = await editWithImagesAPI(client, imageFile, prompt);
          console.log(`  ${result ? "✅" : "❌"} ${i + 1}/3`);
          return result;
        })
      );
    }

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

    console.log(`Done! Mode: ${useResponsesAPI ? "responses-api" : "images-edit"}`);

    return NextResponse.json({
      success: true,
      mode: useResponsesAPI ? "responses-api" : "images-edit",
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
