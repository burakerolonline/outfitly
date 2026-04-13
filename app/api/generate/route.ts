import { NextRequest, NextResponse } from "next/server";

const ANALYSIS_PROMPT = `You are an expert fashion AI analyst. Analyze this person's photo carefully.
Return ONLY a valid JSON object:
{
  "skinTone": "Light" or "Medium" or "Olive" or "Dark",
  "undertone": "Warm" or "Cool" or "Neutral",
  "faceShape": "Oval" or "Round" or "Square" or "Heart" or "Oblong",
  "bodyType": "Ectomorph" or "Mesomorph" or "Endomorph" or "Athletic",
  "hairColor": "string",
  "confidence": number 80-100
}
Return ONLY JSON. No markdown, no explanation.`;

function buildOutfitPrompt(analysis: any, style: string, hasProduct: boolean, productDesc?: string) {
  const colors = analysis.undertone === "Warm"
    ? "earth tones, warm neutrals, camel, rust, olive, gold jewelry"
    : analysis.undertone === "Cool"
    ? "jewel tones, navy, emerald, burgundy, cool grays, silver jewelry"
    : "both warm and cool tones, versatile palette, mixed metals";

  return `You are a world-class fashion stylist.
USER: Skin=${analysis.skinTone}, Undertone=${analysis.undertone}, Face=${analysis.faceShape}, Body=${analysis.bodyType}, Hair=${analysis.hairColor}, Style=${style}
Best colors: ${colors}
${hasProduct ? "Include product: " + productDesc : ""}
Generate 3 outfits as JSON array:
[{"name":"Safe Stylish","top":"...","bottom":"...","shoes":"...","accessories":["..."],"colors":["#hex","#hex","#hex"]},
{"name":"Trendy Bold",...},
{"name":"Premium Luxury",...}]
Be specific: fabric, fit, hex colors. ONLY JSON array, nothing else.`;
}

function buildImagePrompt(outfit: any, analysis: any, style: string) {
  return "Professional fashion photo, full body, " + (analysis.bodyType?.toLowerCase() || "average") + " build, " + (analysis.skinTone?.toLowerCase() || "medium") + " skin, " + (analysis.hairColor?.toLowerCase() || "dark") + " hair, wearing: " + outfit.top + ", " + outfit.bottom + ", " + outfit.shoes + ". " + style + " aesthetic. Studio lighting, clean background, magazine quality, photorealistic, 8k.";
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY bulunamadi. Vercel > Settings > Environment Variables > OPENAI_API_KEY ekleyin." }, { status: 500 });
  }

  try {
    const { imageBase64, style, productUrl } = await request.json();
    if (!imageBase64 || !style) {
      return NextResponse.json({ error: "Fotograf veya stil eksik" }, { status: 400 });
    }

    // STEP 1: Analyze photo with GPT-5.4-mini Vision
    const analysisRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: ANALYSIS_PROMPT },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imageBase64, detail: "low" } },
          ],
        }],
        max_tokens: 300,
      }),
    });

    if (!analysisRes.ok) {
      const err = await analysisRes.text();
      console.error("Analysis error:", err);
      return NextResponse.json({ error: "Analiz basarisiz. API key kontrol edin." }, { status: 500 });
    }

    const analysisData = await analysisRes.json();
    let analysis;
    try {
      const raw = (analysisData.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
      analysis = JSON.parse(raw);
    } catch {
      analysis = { skinTone: "Medium", undertone: "Neutral", faceShape: "Oval", bodyType: "Mesomorph", hairColor: "Brown", confidence: 85 };
    }

    // STEP 2: Generate outfit descriptions with GPT-5.4-mini
    const outfitRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: buildOutfitPrompt(analysis, style, !!productUrl, productUrl) }],
        max_tokens: 2000,
      }),
    });

    if (!outfitRes.ok) {
      return NextResponse.json({ error: "Kiyafet uretimi basarisiz" }, { status: 500 });
    }

    const outfitData = await outfitRes.json();
    let outfits;
    try {
      const raw = (outfitData.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
      outfits = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Kiyafet verisi okunamadi" }, { status: 500 });
    }

    // STEP 3: Generate outfit images with gpt-image-1.5
    const imagePromises = outfits.map(async (outfit: any) => {
      try {
        const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-image-1.5",
            prompt: buildImagePrompt(outfit, analysis, style),
            n: 1,
            size: "1024x1536",
            quality: "high",
          }),
        });
        if (!imgRes.ok) return null;
        const imgData = await imgRes.json();
        const b64 = imgData.data?.[0]?.b64_json;
        return b64 ? "data:image/png;base64," + b64 : imgData.data?.[0]?.url || null;
      } catch { return null; }
    });

    const images = await Promise.all(imagePromises);
    const result = outfits.map((o: any, i: number) => ({ ...o, generatedImage: images[i] || null }));

    return NextResponse.json({ success: true, analysis, outfits: result });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: error.message || "Hata olustu" }, { status: 500 });
  }
}
