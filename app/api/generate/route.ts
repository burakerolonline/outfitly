import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// Raw fetch only — no SDK type issues
// Detailed logging to find the exact problem
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

const OPENAI = "https://api.openai.com/v1";

async function gptText(apiKey: string, messages: any[]): Promise<string> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages, max_tokens: 2000, temperature: 0.5 }),
  });
  if (!res.ok) throw new Error(`GPT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ─── Responses API ile görsel üret (ChatGPT yöntemi) ───
async function responsesAPI(apiKey: string, imageDataUrl: string, prompt: string): Promise<string | null> {
  console.log("    [Responses API] Sending request...");

  const requestBody = {
    model: "gpt-4o",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high",
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
  };

  const res = await fetch(`${OPENAI}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  console.log(`    [Responses API] Status: ${res.status}`);

  if (!res.ok) {
    const errText = await res.text();
    console.error(`    [Responses API] ERROR: ${errText.substring(0, 500)}`);
    return null;
  }

  const data = await res.json();

  // Log the full structure
  const outputTypes = (data.output || []).map((b: any) => b.type);
  console.log(`    [Responses API] Output types: ${JSON.stringify(outputTypes)}`);

  // Search for image in every possible location
  for (const block of data.output || []) {
    // Direct image_generation_call
    if (block.type === "image_generation_call") {
      if (block.result) {
        console.log(`    [Responses API] Found image in image_generation_call (${block.result.length} chars)`);
        return `data:image/png;base64,${block.result}`;
      }
    }

    // Inside message content
    if (block.type === "message" && Array.isArray(block.content)) {
      for (const c of block.content) {
        console.log(`    [Responses API] Message content type: ${c.type}`);
        if (c.type === "output_image" && c.image_url) {
          console.log("    [Responses API] Found output_image");
          return c.image_url;
        }
        if (c.type === "image" && c.image_url) {
          console.log("    [Responses API] Found image");
          return c.image_url;
        }
        if (c.type === "refusal") {
          console.log(`    [Responses API] REFUSAL: ${c.refusal}`);
        }
      }
    }
  }

  // Last resort: dump first 1000 chars of response
  console.log(`    [Responses API] No image found. Full response: ${JSON.stringify(data).substring(0, 1000)}`);
  return null;
}

// ─── images.edit yedek yöntem ───
async function imagesEdit(apiKey: string, imageBase64: string, prompt: string): Promise<string | null> {
  console.log("    [images.edit] Sending request...");

  const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const res = await fetch(`${OPENAI}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: await buildFormData(base64Clean, prompt),
  });

  console.log(`    [images.edit] Status: ${res.status}`);

  if (!res.ok) {
    console.error(`    [images.edit] ERROR: ${(await res.text()).substring(0, 500)}`);
    return null;
  }

  const data = await res.json();
  if (data.data?.[0]?.b64_json) {
    console.log("    [images.edit] Got base64 image");
    return `data:image/png;base64,${data.data[0].b64_json}`;
  }
  if (data.data?.[0]?.url) {
    console.log("    [images.edit] Got URL image");
    return data.data[0].url;
  }

  console.log("    [images.edit] No image in response");
  return null;
}

async function buildFormData(base64: string, prompt: string): Promise<FormData> {
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
  const formData = new FormData();
  formData.append("image", blob, "photo.png");
  formData.append("model", "gpt-image-1");
  formData.append("prompt", prompt);
  formData.append("n", "1");
  formData.append("size", "1024x1024");
  return formData;
}

function buildPrompt(outfit: any, analysis: any): string {
  return `CRITICAL: FACE & IDENTITY PRESERVATION

You are editing a real photograph. Keep the EXACT same person — their face, identity, skin, hair, body, pose, background, lighting must remain pixel-perfect identical. 

Person details (DO NOT CHANGE): ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin, ${analysis.undertone} undertone, ${analysis.hairColor} hair, ${analysis.faceShape} face, ${analysis.bodyType} body.

ONLY CHANGE CLOTHING:
- Top: ${outfit.top}
- Bottom: ${outfit.bottom}  
- Shoes: ${outfit.shoes}

ADD ACCESSORIES:
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- None"}

The result must look like the same photo with different clothes. Face identity = #1 priority. If the face changes even 1%, the output is a failure.`;
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("No API key, returning mock data");
      return NextResponse.json({ success: true, mode: "mock", analysis: getMockAnalysis(), outfits: getMockOutfits() });
    }

    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    console.log(`Image size: ~${Math.round(imageBase64.length / 1024)}KB`);

    // ═══ STEP 1: Analyze ═══
    console.log("=== STEP 1: Analyzing ===");
    let analysis;
    try {
      const raw = await gptText(apiKey, [{
        role: "user",
        content: [
          { type: "text", text: 'Analyze this person. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      }]);
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log("Analysis:", JSON.stringify(analysis));
    } catch (err: any) {
      console.error("Analysis failed:", err?.message);
      analysis = getMockAnalysis();
    }

    // ═══ STEP 2: Outfits ═══
    console.log("=== STEP 2: Outfits ===");
    const styleLabels: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury", streetwear: "Streetwear / Urban",
      minimal: "Minimalist", "smart-casual": "Smart Casual",
      luxury: "High Luxury / Designer", sport: "Athleisure",
    };

    let outfits;
    try {
      const raw = await gptText(apiKey, [{
        role: "user",
        content: `Stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor} hair, ${analysis.bodyType}.\nSTYLE: ${styleLabels[style] || style}\n${productUrl ? "INCLUDE: " + productUrl : ""}\n\n3 outfits. ONLY JSON:\n[{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
      }]);
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log("Outfits:", outfits.map((o: any) => o.name).join(", "));
    } catch (err: any) {
      console.error("Outfits failed:", err?.message);
      outfits = getMockOutfits();
    }

    // ═══ STEP 3: Edit photos ═══
    console.log("=== STEP 3: Editing photos ===");

    // Önce Responses API'yi dene
    console.log("  Testing Responses API with outfit 1...");
    const testPrompt = buildPrompt(outfits[0], analysis);
    const testResult = await responsesAPI(apiKey, imageDataUrl, testPrompt);
    const useResponses = testResult !== null;
    console.log(`  Responses API: ${useResponses ? "SUCCESS" : "FAILED"}`);

    let editResults: (string | null)[];

    if (useResponses) {
      // Responses API çalışıyor
      console.log("  Using Responses API for all outfits...");
      editResults = [testResult];
      for (let i = 1; i < outfits.length; i++) {
        console.log(`  Outfit ${i + 1}/3...`);
        const r = await responsesAPI(apiKey, imageDataUrl, buildPrompt(outfits[i], analysis));
        editResults.push(r);
        console.log(`  Outfit ${i + 1}/3: ${r ? "OK" : "FAIL"}`);
      }
    } else {
      // images.edit fallback
      console.log("  Using images.edit fallback for all outfits...");
      editResults = [];
      for (let i = 0; i < outfits.length; i++) {
        console.log(`  Outfit ${i + 1}/3...`);
        const r = await imagesEdit(apiKey, imageBase64, buildPrompt(outfits[i], analysis));
        editResults.push(r);
        console.log(`  Outfit ${i + 1}/3: ${r ? "OK" : "FAIL"}`);
      }
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

    const mode = useResponses ? "responses-api" : "images-edit";
    console.log(`=== DONE === Mode: ${mode}, Images: ${editResults.filter(Boolean).length}/3`);

    return NextResponse.json({
      success: true,
      mode,
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
    console.error("FATAL:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Generation failed" }, { status: 500 });
  }
}

function getMockAnalysis() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}
function getMockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater (#1B2A4A)", bottom: "Beige chinos (#D2B48C)", shoes: "Brown loafers", accessories: ["Gold watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive shirt (#556B2F)", bottom: "Black trousers (#1A1A1A)", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck (#722F37)", bottom: "Charcoal pants (#36454F)", shoes: "Oxford brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
