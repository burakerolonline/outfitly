import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// Tek model: gpt-4o (ChatGPT'nin kullandığı aynı model)
// Tek API: OpenAI Responses API (image_generation tool)
// Başka hiçbir model/servis yok.
// ═══════════════════════════════════════════════════════

const OPENAI_URL = "https://api.openai.com/v1";

export const maxDuration = 120;

// ─── GPT-4o ile fotoğraf düzenle (ChatGPT ile aynı yöntem) ───
async function editWithGPT4o(
  apiKey: string,
  imageDataUrl: string,
  prompt: string
): Promise<string | null> {
  const response = await fetch(`${OPENAI_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: imageDataUrl,
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
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("GPT-4o error:", err);
    throw new Error(err);
  }

  const data = await response.json();

  // Yanıttaki image bloğunu bul
  for (const block of data.output || []) {
    if (block.type === "image_generation_call" && block.result) {
      return `data:image/png;base64,${block.result}`;
    }
    // Alternatif format
    if (block.type === "message") {
      for (const content of block.content || []) {
        if (content.type === "image" && content.image_url) {
          return content.image_url;
        }
      }
    }
  }

  // data.output doğrudan image içerebilir
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "image_generation_call") {
        return `data:image/png;base64,${item.result}`;
      }
    }
  }

  console.error("No image found in response:", JSON.stringify(data).substring(0, 500));
  return null;
}

// ─── GPT-4o ile text analizi ───
async function analyzeWithGPT4o(apiKey: string, imageDataUrl: string): Promise<any> {
  const response = await fetch(`${OPENAI_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: imageDataUrl,
            },
            {
              type: "input_text",
              text: 'Analyze this person for fashion styling. Respond ONLY valid JSON:\n{"skinTone":"Light/Medium/Olive/Dark","undertone":"Warm/Cool/Neutral","faceShape":"Oval/Round/Square/Heart","bodyType":"Ectomorph/Mesomorph/Endomorph/Athletic","hairColor":"...","gender":"Male/Female","age":"...","confidence":95}',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();

  // Text yanıtı bul
  for (const block of data.output || []) {
    if (block.type === "message") {
      for (const content of block.content || []) {
        if (content.type === "output_text") {
          return JSON.parse(content.text.replace(/```json|```/g, "").trim());
        }
      }
    }
  }

  throw new Error("No text in response");
}

// ─── GPT-4o ile kıyafet önerisi ───
async function getOutfitSuggestions(apiKey: string, analysis: any, style: string, productUrl?: string): Promise<any[]> {
  const styleLabels: Record<string, string> = {
    "old-money": "Old Money / Quiet Luxury",
    streetwear: "Streetwear / Urban",
    minimal: "Minimalist",
    "smart-casual": "Smart Casual",
    luxury: "High Luxury / Designer",
    sport: "Athleisure",
  };

  const response = await fetch(`${OPENAI_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `World-class stylist. PERSON: ${analysis.gender}, ~${analysis.age}, ${analysis.skinTone} skin (${analysis.undertone}), ${analysis.hairColor} hair, ${analysis.bodyType}.
STYLE: ${styleLabels[style] || style}
${productUrl ? "INCLUDE: " + productUrl : ""}

3 outfits. ONLY JSON array:
[{"name":"Safe Stylish","description":"...","top":"garment fabric color #hex","bottom":"garment fabric color #hex","shoes":"shoe material color","accessories":["item1","item2"],"colors":["#hex1","#hex2","#hex3"],"occasion":"..."},{"name":"Trendy Bold",...},{"name":"Premium Luxury",...}]`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();

  for (const block of data.output || []) {
    if (block.type === "message") {
      for (const content of block.content || []) {
        if (content.type === "output_text") {
          return JSON.parse(content.text.replace(/```json|```/g, "").trim());
        }
      }
    }
  }

  throw new Error("No outfits in response");
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
      return NextResponse.json({ success: true, mode: "mock", analysis: getMockAnalysis(), outfits: getMockOutfits() });
    }

    const imageDataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

    // STEP 1: Analiz
    console.log("Step 1: Analyzing...");
    let analysis;
    try {
      analysis = await analyzeWithGPT4o(apiKey, imageDataUrl);
    } catch (err) {
      console.error("Analysis failed:", err);
      analysis = getMockAnalysis();
    }

    // STEP 2: Kıyafet önerileri
    console.log("Step 2: Outfit suggestions...");
    let outfits;
    try {
      outfits = await getOutfitSuggestions(apiKey, analysis, style, productUrl);
    } catch (err) {
      console.error("Outfits failed:", err);
      outfits = getMockOutfits();
    }

    // STEP 3: Her outfit için fotoğrafı düzenle (gpt-4o + image_generation)
    console.log("Step 3: Editing photos with gpt-4o...");

    const editResults = await Promise.all(
      outfits.map(async (outfit: any, i: number) => {
        try {
          const prompt = `Bu fotoğraftaki kişinin fotoğrafını düzenle. 

KESİNLİKLE DEĞİŞTİRME:
- Yüz, saç, ten rengi, vücut şekli, poz, duruş — hepsi aynı kalacak
- Arka plan, ışık, kamera açısı — aynı kalacak
- Elindeki telefon/eşya — aynı kalacak

SADECE KIYAFETLERİ DEĞİŞTİR:
- Üst: ${outfit.top}
- Alt: ${outfit.bottom}
- Ayakkabı: ${outfit.shoes}

AKSESUAR EKLE:
${outfit.accessories?.map((a: string) => "- " + a).join("\n") || "- Yok"}

Sonuç gerçek bir fotoğraf gibi görünmeli. Kişinin kimliği değişmemeli, sadece kıyafetleri değişmeli.`;

          console.log(`  Outfit ${i + 1}/3: ${outfit.name}...`);
          const result = await editWithGPT4o(apiKey, imageDataUrl, prompt);
          console.log(`  ${result ? "✅" : "❌"} Outfit ${i + 1}/3`);
          return result;
        } catch (err: any) {
          console.error(`  Failed ${i + 1}/3:`, err?.message?.substring(0, 200) || err);
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

    console.log("Done!");

    return NextResponse.json({
      success: true,
      mode: "gpt-4o",
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
