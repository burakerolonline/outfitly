import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

// ═══════════════════════════════════════════════════════
// 1. Responses API dene (ChatGPT yöntemi)
// 2. Başarısızsa → images.edit + gpt-image-1 + mask
// 3. Hata mesajını response'a yaz (debug için)
// ═══════════════════════════════════════════════════════

export const maxDuration = 120;

function getClient(): OpenAI | null {
  const k = process.env.OPENAI_API_KEY;
  return k ? new OpenAI({ apiKey: k }) : null;
}

// ─── Mask: üst kısım korunan, alt kısım düzenlenecek ───
async function buildMask(size: number, protectPercent: number): Promise<Buffer> {
  const cut = Math.floor((protectPercent / 100) * size);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[i + 3] = y < cut ? 255 : 0; // opaque=keep, transparent=edit
    }
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer();
}

// ─── Responses API ile görsel üret ───
async function tryResponsesAPI(apiKey: string, imageUrl: string, prompt: string): Promise<{ image: string | null; error: string | null }> {
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [{
          role: "user",
          content: [
            { type: "input_image", image_url: imageUrl },
            { type: "input_text", text: prompt },
          ],
        }],
        tools: [{ type: "image_generation", quality: "high", size: "1024x1024" }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { image: null, error: `Responses API ${res.status}: ${err.substring(0, 200)}` };
    }

    const data = await res.json();
    for (const block of data.output || []) {
      if (block.type === "image_generation_call" && block.result) {
        return { image: `data:image/png;base64,${block.result}`, error: null };
      }
      if (block.type === "message") {
        for (const c of block.content || []) {
          if (c.type === "output_image" && c.image_url) return { image: c.image_url, error: null };
          if (c.type === "image" && c.image_url) return { image: c.image_url, error: null };
        }
      }
    }

    const types = (data.output || []).map((b: any) => b.type).join(",");
    return { image: null, error: `No image in response. Output types: [${types}]` };
  } catch (err: any) {
    return { image: null, error: `Exception: ${err?.message?.substring(0, 200)}` };
  }
}

// ─── images.edit + mask ile düzenle ───
async function tryImagesEdit(client: OpenAI, imageFile: any, maskFile: any, prompt: string): Promise<{ image: string | null; error: string | null }> {
  try {
    const response = await (client.images.edit as any)({
      model: "gpt-image-1",
      image: imageFile,
      mask: maskFile,
      prompt,
      n: 1,
      size: "1024x1024",
    });
    const d = response?.data?.[0];
    if (d?.b64_json) return { image: `data:image/png;base64,${d.b64_json}`, error: null };
    if (d?.url) return { image: d.url, error: null };
    return { image: null, error: "images.edit returned no image" };
  } catch (err: any) {
    return { image: null, error: `images.edit: ${err?.message?.substring(0, 200)}` };
  }
}

// ═══════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const client = getClient();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!client || !apiKey) return NextResponse.json({ success: true, mode: "mock", analysis: mockA(), outfits: mockO() });

    // Resize
    const raw = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    const png1024 = await sharp(raw).resize(1024, 1024, { fit: "cover", position: "attention" }).png().toBuffer();
    const jpg1024 = await sharp(raw).resize(1024, 1024, { fit: "cover", position: "attention" }).jpeg({ quality: 85 }).toBuffer();
    const jpgUrl = `data:image/jpeg;base64,${jpg1024.toString("base64")}`;

    // Mask + files for images.edit
    const mask1024 = await buildMask(1024, 45);
    const imageFile = await toFile(png1024, "photo.png", { type: "image/png" });
    const maskFile = await toFile(mask1024, "mask.png", { type: "image/png" });

    // Analyze
    let analysis: any;
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o", max_tokens: 300, temperature: 0.3,
        messages: [{ role: "user", content: [
          { type: "text", text: 'ONLY JSON:{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"25-30","confidence":95}' },
          { type: "image_url", image_url: { url: jpgUrl } },
        ]}],
      });
      analysis = JSON.parse((r.choices[0]?.message?.content || "{}").replace(/```json|```/g, "").trim());
    } catch { analysis = mockA(); }

    // Outfits
    const sl: Record<string, string> = { "old-money": "Old Money", streetwear: "Streetwear", minimal: "Minimalist", "smart-casual": "Smart Casual", luxury: "Luxury", sport: "Athleisure" };
    let outfits: any[];
    try {
      const r = await client.chat.completions.create({
        model: "gpt-4o", max_tokens: 1500, temperature: 0.7,
        messages: [{ role: "user", content: `Stylist. ${analysis.gender}, ${analysis.age}, ${analysis.skinTone} (${analysis.undertone}), ${analysis.hairColor}, ${analysis.bodyType}. STYLE: ${sl[style] || style}. ${productUrl || ""} 3 outfits ONLY JSON: [{"name":"Safe Stylish","description":"...","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]` }],
      });
      outfits = JSON.parse((r.choices[0]?.message?.content || "[]").replace(/```json|```/g, "").trim());
    } catch { outfits = mockO(); }

    // ═══ EDIT PHOTOS ═══
    const results: { image: string | null; method: string; error: string | null }[] = [];
    let responsesWorks: boolean | null = null;

    for (let i = 0; i < outfits.length; i++) {
      const o = outfits[i];
      const prompt = `Keep the EXACT same person, same face, same identity, same skin tone, same hair. Do NOT change facial features. Only replace clothing. Preserve lighting, pose and background. Replace clothing with: Top: ${o.top}, Bottom: ${o.bottom}, Shoes: ${o.shoes}. Add: ${o.accessories?.join(", ") || "nothing"}.`;

      // İlk outfit'te Responses API'yi test et
      if (responsesWorks === null) {
        console.log(`[${i + 1}/3] Testing Responses API...`);
        const r = await tryResponsesAPI(apiKey, jpgUrl, prompt);
        if (r.image) {
          responsesWorks = true;
          results.push({ image: r.image, method: "responses-api", error: null });
          console.log(`[${i + 1}/3] ✅ Responses API works!`);
          continue;
        } else {
          responsesWorks = false;
          console.log(`[${i + 1}/3] ❌ Responses API failed: ${r.error}`);
          // Fallback to images.edit
          const f = await tryImagesEdit(client, imageFile, maskFile, prompt);
          results.push({ image: f.image, method: "images-edit-fallback", error: r.error });
          console.log(`[${i + 1}/3] ${f.image ? "✅" : "❌"} images.edit fallback`);
          continue;
        }
      }

      // Kalan outfitler — çalışan yöntemi kullan
      if (responsesWorks) {
        console.log(`[${i + 1}/3] Responses API...`);
        const r = await tryResponsesAPI(apiKey, jpgUrl, prompt);
        results.push({ image: r.image, method: "responses-api", error: r.error });
      } else {
        console.log(`[${i + 1}/3] images.edit...`);
        const f = await tryImagesEdit(client, imageFile, maskFile, prompt);
        results.push({ image: f.image, method: "images-edit", error: f.error });
      }
      console.log(`[${i + 1}/3] ${results[i]?.image ? "✅" : "❌"}`);
    }

    const method = responsesWorks ? "responses-api" : "images-edit";
    const errors = results.filter(r => r.error).map(r => r.error);
    console.log(`[DONE] Method: ${method}, Images: ${results.filter(r => r.image).length}/3, Errors: ${errors.length}`);

    return NextResponse.json({
      success: true,
      mode: method,
      debugErrors: errors, // ← frontend'de görebilirsin
      analysis: {
        skinTone: analysis.skinTone || "Medium", undertone: analysis.undertone || "Neutral",
        faceShape: analysis.faceShape || "Oval", bodyType: analysis.bodyType || "Mesomorph",
        hairColor: analysis.hairColor || "Brown", gender: analysis.gender || "Unknown",
        confidence: analysis.confidence || "90",
      },
      outfits: outfits.map((o: any, i: number) => ({
        name: o.name || ["Safe Stylish", "Trendy Bold", "Premium Luxury"][i],
        description: (o.description || "") + (results[i]?.error ? ` [DEBUG: ${results[i].error}]` : "") + ` [Method: ${results[i]?.method || "?"}]`,
        top: o.top || "", bottom: o.bottom || "", shoes: o.shoes || "",
        accessories: o.accessories || [], colors: o.colors || ["#333", "#666", "#999"],
        occasion: o.occasion || "", generatedImage: results[i]?.image || null,
      })),
    });
  } catch (error: any) {
    console.error("FATAL:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}

function mockA() { return { skinTone: "Medium", undertone: "Warm", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", gender: "Male", confidence: "92" }; }
function mockO() { return [
  { name: "Safe Stylish", description: "Classic", top: "Navy sweater", bottom: "Beige chinos", shoes: "Brown loafers", accessories: ["Watch"], colors: ["#1B2A4A", "#D2B48C", "#8B6914"], occasion: "Casual", generatedImage: null },
  { name: "Trendy Bold", description: "Bold", top: "Olive shirt", bottom: "Black trousers", shoes: "White sneakers", accessories: ["Chain"], colors: ["#556B2F", "#1A1A1A", "#FFF"], occasion: "Weekend", generatedImage: null },
  { name: "Premium Luxury", description: "Luxury", top: "Burgundy turtleneck", bottom: "Charcoal pants", shoes: "Brogues", accessories: ["Pocket square"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner", generatedImage: null },
]; }
