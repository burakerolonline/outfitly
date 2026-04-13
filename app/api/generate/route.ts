import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// MASK-BASED INPAINTING — OpenAI SDK Version
//
// 1. sharp      → resize image + create mask PNG
// 2. GPT-4o     → analyze person + suggest outfits
// 3. images.edit + mask → only clothing area edited
//    Face pixels NEVER touched (protected by mask)
//
// Requires: OPENAI_API_KEY
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// ─── GPT-4o text call ───
async function gptText(client: OpenAI, messages: any[]): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 2000,
    temperature: 0.5,
  });
  return res.choices[0]?.message?.content || "";
}

// ─── Detect where the chin ends (% from top) on the RESIZED image ───
async function detectChinPosition(client: OpenAI, resizedBase64: string): Promise<number> {
  try {
    const dataUrl = `data:image/png;base64,${resizedBase64}`;
    const raw = await gptText(client, [{
      role: "user",
      content: [
        {
          type: "text",
          text: `This is a square photo. Where does this person's CHIN end? Give the vertical position as a percentage from the top. Just respond with a number like 38. Nothing else.`,
        },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }]);

    const num = parseInt(raw.trim(), 10);
    if (isNaN(num) || num < 10 || num > 80) {
      console.log(`  Invalid chin position "${raw}", defaulting to 38%`);
      return 38;
    }
    console.log(`  Chin at ${num}%`);
    return num;
  } catch (err) {
    console.error("  Chin detection failed:", err);
    return 38;
  }
}

// ─── Create mask PNG with sharp ───
// Top section = opaque black (alpha 255) = PROTECTED (face, hair, head)
// Bottom section = transparent (alpha 0) = EDITABLE (clothing, body)
async function createMaskPng(size: number, protectTopPercent: number): Promise<Buffer> {
  const splitY = Math.floor((protectTopPercent / 100) * size);
  console.log(`  Mask: protecting top ${protectTopPercent}% (0→${splitY}px), editing bottom ${100 - protectTopPercent}% (${splitY}→${size}px)`);

  // Create raw RGBA pixel data
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (y < splitY) {
        // PROTECTED: opaque (alpha=255). Face stays untouched.
        pixels[i] = 0;       // R
        pixels[i + 1] = 0;   // G
        pixels[i + 2] = 0;   // B
        pixels[i + 3] = 255; // A = opaque = KEEP
      } else {
        // EDITABLE: transparent (alpha=0). Clothing gets replaced.
        pixels[i] = 0;       // R
        pixels[i + 1] = 0;   // G
        pixels[i + 2] = 0;   // B
        pixels[i + 3] = 0;   // A = transparent = EDIT
      }
    }
  }

  const png = await sharp(pixels, {
    raw: { width: size, height: size, channels: 4 },
  }).png().toBuffer();

  console.log(`  Mask PNG: ${png.length} bytes`);
  return png;
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

    const client = getClient();
    if (!client) {
      return NextResponse.json({ success: true, mode: "mock", analysis: getMockAnalysis(), outfits: getMockOutfits() });
    }

    // ═══ PREPARE: Resize to 1024x1024 square PNG ═══
    console.log("=== PREPARE ===");
    const base64Raw = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const inputBuf = Buffer.from(base64Raw, "base64");

    const resizedPng = await sharp(inputBuf)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();

    const resizedB64 = resizedPng.toString("base64");
    console.log(`Image resized: ${resizedPng.length} bytes`);

    // ═══ STEP 1: Detect face on RESIZED image ═══
    console.log("=== STEP 1: Detect face ===");
    const chinPercent = await detectChinPosition(client, resizedB64);
    // Add 12% padding below chin (neck + collar area)
    const protectPercent = Math.min(chinPercent + 12, 65);
    console.log(`  Protecting top ${protectPercent}%`);

    // ═══ STEP 2: Create mask ═══
    console.log("=== STEP 2: Create mask ===");
    const maskPng = await createMaskPng(1024, protectPercent);

    // ═══ STEP 3: Analyze person ═══
    console.log("=== STEP 3: Analyze ===");
    const resizedDataUrl = `data:image/png;base64,${resizedB64}`;
    let analysis: any;
    try {
      const raw = await gptText(client, [{
        role: "user",
        content: [
          { type: "text", text: 'Analyze for styling. ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: resizedDataUrl } },
        ],
      }]);
      analysis = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`  ${analysis.gender}, ${analysis.age}, ${analysis.skinTone}`);
    } catch {
      analysis = getMockAnalysis();
    }

    // ═══ STEP 4: Outfit suggestions ═══
    console.log("=== STEP 4: Outfits ===");
    const styles: Record<string, string> = {
      "old-money": "Old Money / Quiet Luxury", streetwear: "Streetwear / Urban",
      minimal: "Minimalist", "smart-casual": "Smart Casual",
      luxury: "High Luxury / Designer", sport: "Athleisure",
    };

    let outfits: any[];
    try {
      const raw = await gptText(client, [{
        role: "user",
        content: `Stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}.\nSTYLE: ${styles[style] || style}\n${productUrl ? "INCLUDE: " + productUrl : ""}\n\n3 outfits, ONLY JSON:\n[{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
      }]);
      outfits = JSON.parse(raw.replace(/```json|```/g, "").trim());
      console.log(`  ${outfits.map((o: any) => o.name).join(", ")}`);
    } catch {
      outfits = getMockOutfits();
    }

    // ═══ STEP 5: Edit photo with mask using OpenAI SDK ═══
    console.log("=== STEP 5: images.edit with mask ===");

    // Convert to SDK file objects (this is proven to work)
    const imageFile = await toFile(resizedPng, "photo.png", { type: "image/png" });
    const maskFile = await toFile(maskPng, "mask.png", { type: "image/png" });

    const results: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`  [${i + 1}/3] ${o.name}...`);

      try {
        const prompt = `Keep the EXACT same person, same face, same identity, same skin tone, same hair. Do NOT change facial features. Preserve the original lighting, pose and background.

Only replace clothing in the lower/body area with:
- Top: ${o.top}
- Bottom: ${o.bottom}
- Shoes: ${o.shoes}
- Accessories: ${o.accessories?.join(", ") || "none"}

The clothing must fit the person's body naturally with realistic fabric and shadows. Result must look like the original unedited photo.`;

        const response = await client.images.edit({
          model: "gpt-image-1",
          image: imageFile,
          mask: maskFile,
          prompt,
          n: 1,
          size: "1024x1024",
        });

        const data = response.data?.[0];
        if (data?.b64_json) {
          console.log(`  [${i + 1}/3] ✅ OK (b64)`);
          results.push(`data:image/png;base64,${data.b64_json}`);
        } else if (data?.url) {
          console.log(`  [${i + 1}/3] ✅ OK (url)`);
          results.push(data.url);
        } else {
          console.log(`  [${i + 1}/3] ⚠️ No image returned`);
          results.push(null);
        }
      } catch (err: any) {
        console.error(`  [${i + 1}/3] ❌ ${err?.message?.substring(0, 200)}`);
        results.push(null);
      }
    }

    // Build response
    const finalOutfits = outfits.map((o: any, i: number) => ({
      name: o.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
      description: o.description || "",
      top: o.top || "",
      bottom: o.bottom || "",
      shoes: o.shoes || "",
      accessories: o.accessories || [],
      colors: o.colors || ["#333", "#666", "#999"],
      occasion: o.occasion || "",
      generatedImage: results[i] || null,
    }));

    console.log(`=== DONE === ${results.filter(Boolean).length}/3 images`);

    return NextResponse.json({
      success: true,
      mode: "mask-inpainting",
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
