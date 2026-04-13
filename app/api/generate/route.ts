import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// openai.images.edit + model: gpt-image-1 + MASK
// DALL-E 3 YOK. images.generate YOK.
// Sadece images.edit — kullanıcı fotoğrafını düzenler.
// Mask ile yüz korunur, sadece kıyafet değişir.
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAI({ apiKey: key }) : null;
}

// ─── Basit mask: üst kısım korunan, alt kısım düzenlenecek ───
async function buildMask(size: number, protectTopPercent: number): Promise<Buffer> {
  const cutoff = Math.floor((protectTopPercent / 100) * size);
  const buf = Buffer.alloc(size * size * 4); // RGBA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (y < cutoff) {
        // ÜST = opaque = KORU (yüz, saç, kafa)
        buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 255;
      } else {
        // ALT = transparent = DÜZENLE (kıyafet, gövde)
        buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
      }
    }
  }

  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

// ═══════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Missing image or style" }, { status: 400 });
    }

    const client = getClient();
    if (!client) {
      return NextResponse.json({ success: true, mode: "mock", analysis: mockAnalysis(), outfits: mockOutfits() });
    }

    const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const raw = Buffer.from(b64, "base64");

    // ═══ RESIZE to 1024x1024 ═══
    console.log("[1] Resizing to 1024x1024...");
    const img1024 = await sharp(raw)
      .resize(1024, 1024, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
    console.log(`    Image: ${img1024.length} bytes`);

    // ═══ MASK oluştur (üst %45 korunan) ═══
    console.log("[2] Creating mask...");
    const mask1024 = await buildMask(1024, 45);
    console.log(`    Mask: ${mask1024.length} bytes`);

    // ═══ ANALYZE ═══
    console.log("[3] Analyzing...");
    const dataUrl = `data:image/png;base64,${img1024.toString("base64")}`;
    let analysis: any;
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 300,
        temperature: 0.3,
        messages: [{ role: "user", content: [
          { type: "text", text: 'ONLY JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: dataUrl } },
        ]}],
      });
      analysis = JSON.parse((r.choices[0]?.message?.content || "{}").replace(/```json|```/g, "").trim());
      console.log(`    ${analysis.gender}, ${analysis.age}, ${analysis.skinTone}`);
    } catch { analysis = mockAnalysis(); }

    // ═══ OUTFITS ═══
    console.log("[4] Generating outfits...");
    const sl: Record<string, string> = {
      "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist",
      "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure",
    };
    let outfits: any[];
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o", max_tokens: 1500, temperature: 0.7,
        messages: [{ role: "user", content:
          `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl ? "INCLUDE:" + productUrl : ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`
        }],
      });
      outfits = JSON.parse((r.choices[0]?.message?.content || "[]").replace(/```json|```/g, "").trim());
      console.log(`    ${outfits.map((o: any) => o.name).join(", ")}`);
    } catch { outfits = mockOutfits(); }

    // ═══ EDIT PHOTO WITH MASK — gpt-image-1 ═══
    console.log("[5] Editing with gpt-image-1 + mask...");

    const imageFile = await toFile(img1024, "photo.png", { type: "image/png" });
    const maskFile = await toFile(mask1024, "mask.png", { type: "image/png" });

    const results: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`    [${i + 1}/3] ${o.name}...`);
      try {
        const editPrompt = `Keep the EXACT same person, same face, same identity, same skin tone, same hair. Do NOT change facial features. Only replace clothing. Preserve lighting, pose and background.

Replace clothing with:
- Top: ${o.top}
- Bottom: ${o.bottom}
- Shoes: ${o.shoes}
- Add: ${o.accessories?.join(", ") || "nothing"}

Clothing must fit naturally. Result must look like original photo.`;

        // gpt-image-1 + images.edit + mask
        // as any bypasses TypeScript strict typing
        const response = await (client.images.edit as any)({
          model: "gpt-image-1",
          image: imageFile,
          mask: maskFile,
          prompt: editPrompt,
          n: 1,
          size: "1024x1024",
        });

        const d = response?.data?.[0];
        if (d?.b64_json) {
          results.push(`data:image/png;base64,${d.b64_json}`);
          console.log(`    [${i + 1}/3] ✅`);
        } else if (d?.url) {
          results.push(d.url);
          console.log(`    [${i + 1}/3] ✅`);
        } else {
          results.push(null);
          console.log(`    [${i + 1}/3] ⚠️ no image`);
        }
      } catch (err: any) {
        console.error(`    [${i + 1}/3] ❌ ${err?.message?.substring(0, 300)}`);
        results.push(null);
      }
    }

    console.log(`[DONE] ${results.filter(Boolean).length}/3 images`);

    return NextResponse.json({
      success: true,
      mode: "gpt-image-1-mask",
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
        description: o.description || "",
        top: o.top || "", bottom: o.bottom || "", shoes: o.shoes || "",
        accessories: o.accessories || [], colors: o.colors || ["#333", "#666", "#999"],
        occasion: o.occasion || "", generatedImage: results[i] || null,
      })),
    });
  } catch (error: any) {
    console.error("FATAL:", error?.message || error);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

function mockAnalysis() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}
function mockOutfits() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater", bottom: "Beige chinos", shoes: "Brown loafers", accessories: ["Watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive shirt", bottom: "Black trousers", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck", bottom: "Charcoal pants", shoes: "Brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
