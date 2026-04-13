import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// images.edit + gpt-image-1 + SMOOTH FADE MASK
//
// Mask:
//   0% — 55%  → alpha=255 (tam koruma: yüz, saç, boyun)
//  55% — 70%  → alpha smooth fade (geçiş bölgesi)
//  70% — 100% → alpha=0 (tam düzenleme: kıyafet, ayakkabı)
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const k = process.env.OPENAI_API_KEY;
  return k ? new OpenAI({ apiKey: k }) : null;
}

async function buildSmoothMask(size: number): Promise<Buffer> {
  const fadeStart = Math.floor(0.55 * size); // 563px — buraya kadar tam koruma
  const fadeEnd = Math.floor(0.70 * size);   // 716px — buradan sonra tam düzenleme
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let alpha;
      if (y < fadeStart) {
        alpha = 255; // tamamen koru (yüz, saç, boyun, üst göğüs)
      } else if (y > fadeEnd) {
        alpha = 0; // tamamen değiştir (kıyafet, ayakkabı)
      } else {
        const t = (y - fadeStart) / (fadeEnd - fadeStart);
        alpha = Math.round(255 * (1 - t)); // smooth fade
      }
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = alpha;
    }
  }

  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const client = getClient();
    if (!client) return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });

    // Resize to 1024x1024
    const raw = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const png = await sharp(raw).resize(1024, 1024, { fit: "cover", position: "attention" }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

    // Smooth fade mask
    const mask = await buildSmoothMask(1024);

    // SDK file objects
    const imageFile = await toFile(png, "photo.png", { type: "image/png" });
    const maskFile = await toFile(mask, "mask.png", { type: "image/png" });

    // Analyze
    let analysis: any;
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o", max_tokens: 300, temperature: 0.3,
        messages: [{ role: "user", content: [
          { type: "text", text: 'ONLY JSON:{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: dataUrl } },
        ]}],
      });
      analysis = JSON.parse((r.choices[0]?.message?.content || "{}").replace(/```json|```/g, "").trim());
    } catch { analysis = mockA(); }

    // Outfits
    const sl: Record<string, string> = {
      "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist",
      "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure",
    };
    let outfits: any[];
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o", max_tokens: 1500, temperature: 0.7,
        messages: [{ role: "user", content:
          `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl || ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`
        }],
      });
      outfits = JSON.parse((r.choices[0]?.message?.content || "[]").replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // Edit photos: images.edit + gpt-image-1 + smooth mask
    const results: (string | null)[] = [];

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      console.log(`[${i + 1}/3] ${o.name}...`);
      try {
        const prompt = `Keep the EXACT same person, same face, same identity, same skin tone, same hair. Do NOT change facial features. Only replace clothing. Preserve lighting, pose and background.

New clothing:
- Top: ${o.top}
- Bottom: ${o.bottom}
- Shoes: ${o.shoes}
- Accessories: ${o.accessories?.join(", ") || "none"}

The clothing must fit the person naturally with realistic fabric and shadows. Result must look like the original unedited photo with different clothes.`;

        const response = await (client.images.edit as any)({
          model: "gpt-image-1",
          image: imageFile,
          mask: maskFile,
          prompt,
          n: 1,
          size: "1024x1024",
        });

        const d = response?.data?.[0];
        if (d?.b64_json) {
          results.push(`data:image/png;base64,${d.b64_json}`);
          console.log(`[${i + 1}/3] ✅`);
        } else if (d?.url) {
          results.push(d.url);
          console.log(`[${i + 1}/3] ✅`);
        } else {
          results.push(null);
          console.log(`[${i + 1}/3] ⚠️`);
        }
      } catch (err: any) {
        console.error(`[${i + 1}/3] ❌ ${err?.message?.substring(0, 200)}`);
        results.push(null);
      }
    }

    console.log(`[DONE] ${results.filter(Boolean).length}/3`);

    return NextResponse.json({
      success: true,
      mode: "gpt-image-1-smooth-mask",
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
    console.error("FATAL:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

function mockA() {
  return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" };
}
function mockO() {
  return [
    { name: "Safe Stylish", description: "Classic", top: "Navy sweater", bottom: "Beige chinos", shoes: "Brown loafers", accessories: ["Watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
    { name: "Trendy Bold", description: "Bold", top: "Olive shirt", bottom: "Black trousers", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
    { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck", bottom: "Charcoal pants", shoes: "Brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
  ];
}
