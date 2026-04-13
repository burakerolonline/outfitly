// ─── STYLE DEFINITIONS ───────────────────────────────
export const STYLES = [
  { id: "old-money", label: "Old Money", icon: "🏛️", desc: "Timeless elegance, quiet luxury", colors: ["#2C3E50", "#8B7355", "#F5F0EB", "#1A1A2E"] },
  { id: "streetwear", label: "Streetwear", icon: "🔥", desc: "Urban edge, bold statements", colors: ["#1A1A1A", "#FF4444", "#FFFFFF", "#333333"] },
  { id: "minimal", label: "Minimal", icon: "◻️", desc: "Clean lines, neutral palettes", colors: ["#FAFAFA", "#2D2D2D", "#E0E0E0", "#4A4A4A"] },
  { id: "smart-casual", label: "Smart Casual", icon: "👔", desc: "Refined yet relaxed", colors: ["#34495E", "#ECF0F1", "#2980B9", "#7F8C8D"] },
  { id: "luxury", label: "Luxury", icon: "💎", desc: "High fashion, premium fabrics", colors: ["#0D0D0D", "#C9A84C", "#FFFFFF", "#2C2C2C"] },
  { id: "sport", label: "Sport", icon: "⚡", desc: "Athletic performance style", colors: ["#1E1E1E", "#00D4FF", "#F0F0F0", "#FF6B00"] },
];

export const SKIN_TONES = ["Light", "Medium", "Olive", "Dark"];
export const UNDERTONES = ["Warm", "Cool", "Neutral"];
export const FACE_SHAPES = ["Oval", "Round", "Square", "Heart", "Oblong"];
export const BODY_TYPES = ["Ectomorph", "Mesomorph", "Endomorph", "Athletic"];

// ─── AI PROMPT TEMPLATES ─────────────────────────────
// These are the prompts you send to your AI APIs (e.g. GPT-4 Vision, Stable Diffusion, etc.)

export const AI_PROMPTS = {
  // Step 1: Send user image to a Vision model (GPT-4V, Claude Vision, etc.)
  analysis: () => `You are an expert fashion AI analyst. Analyze this person's photo and return ONLY valid JSON:
{
  "skinTone": "Light" | "Medium" | "Olive" | "Dark",
  "undertone": "Warm" | "Cool" | "Neutral",
  "faceShape": "Oval" | "Round" | "Square" | "Heart" | "Oblong",
  "bodyType": "Ectomorph" | "Mesomorph" | "Endomorph" | "Athletic",
  "hairColor": "string",
  "confidence": number (0-100)
}
Be precise. Base analysis on visible features only.`,

  // Step 2: Generate outfit descriptions
  generation: (params: {
    skinTone: string;
    undertone: string;
    style: string;
    bodyType: string;
    faceShape: string;
    hasProduct: boolean;
    productDesc?: string;
  }) => `You are a professional AI stylist and fashion expert.
KEEP the same person, face, pose, lighting. DO NOT change identity. ONLY change outfit.

USER ANALYSIS:
- Skin Tone: ${params.skinTone}
- Undertone: ${params.undertone}
- Face Shape: ${params.faceShape}
- Body Type: ${params.bodyType}
- Selected Style: ${params.style}

${params.hasProduct ? `PRODUCT TO INTEGRATE: ${params.productDesc}` : "Generate complete outfit from scratch."}

Generate 3 outfit variations as JSON array:
[
  {
    "name": "Safe Stylish",
    "top": "description with fabric, fit, color hex",
    "bottom": "description with fabric, fit, color hex",
    "shoes": "style, material, color",
    "accessories": ["item1", "item2", "item3"],
    "colors": ["#hex1", "#hex2", "#hex3"]
  },
  { "name": "Trendy Bold", ... },
  { "name": "Premium Luxury", ... }
]

COLOR MATCHING RULES:
- ${params.undertone} undertone → ${
    params.undertone === "Warm"
      ? "earth tones, warm neutrals, gold jewelry"
      : params.undertone === "Cool"
      ? "jewel tones, cool grays, silver jewelry"
      : "both warm and cool tones, mixed metals"
  }

Each outfit must look like a real photo, not AI-generated.`,

  // Step 3: Image generation prompt for diffusion model (Stable Diffusion, DALL-E, Midjourney)
  imageGeneration: (params: {
    style: string;
    outfitDesc: string;
    skinTone: string;
  }) => `Professional fashion photography, same person same pose same face, wearing ${params.outfitDesc}, ${params.style} style, ${params.skinTone} skin tone, studio lighting, high resolution, photorealistic, 8k, magazine quality, no identity change, natural look`,
};

// ─── MOCK DATA GENERATORS ────────────────────────────
// Replace these with real API calls in production

export function generateMockAnalysis() {
  return {
    skinTone: SKIN_TONES[Math.floor(Math.random() * 4)],
    undertone: UNDERTONES[Math.floor(Math.random() * 3)],
    faceShape: FACE_SHAPES[Math.floor(Math.random() * 5)],
    bodyType: BODY_TYPES[Math.floor(Math.random() * 4)],
    hairColor: ["Black", "Brown", "Blonde", "Auburn", "Red"][Math.floor(Math.random() * 5)],
    confidence: (85 + Math.random() * 14).toFixed(1),
  };
}

const OUTFIT_DATABASE: Record<string, Array<{
  name: string; description: string; top: string; bottom: string; shoes: string; accessories: string[]; colors: string[]; occasion: string; generatedImage: string | null;
}>> = {
  "old-money": [
    { name: "Classic Heritage", description: "Timeless quiet luxury", top: "Cream cashmere V-neck sweater (#F5F0EB)", bottom: "Navy wool tailored trousers (#1B2A4A)", shoes: "Brown suede loafers", accessories: ["Gold watch", "Leather belt", "Silk pocket square"], colors: ["#F5F0EB", "#1B2A4A", "#8B6914"], occasion: "Business lunch", generatedImage: null },
    { name: "Modern Prep", description: "Updated preppy style", top: "Olive linen button-down shirt (#556B2F)", bottom: "Beige chino pants, relaxed fit (#D2B48C)", shoes: "White leather sneakers", accessories: ["Tortoiseshell sunglasses", "Canvas tote", "Silver bracelet"], colors: ["#556B2F", "#D2B48C", "#FFFFFF"], occasion: "Weekend brunch", generatedImage: null },
    { name: "Luxury Estate", description: "Premium investment pieces", top: "Burgundy merino wool turtleneck (#722F37)", bottom: "Charcoal flannel dress pants (#36454F)", shoes: "Oxford brogues in cognac", accessories: ["Hermès-style belt", "Pearl earrings", "Structured handbag"], colors: ["#722F37", "#36454F", "#C68E17"], occasion: "Dinner party", generatedImage: null },
  ],
  "streetwear": [
    { name: "Urban Core", description: "Clean street essentials", top: "Oversized black graphic tee (#1A1A1A)", bottom: "Baggy cargo pants in olive (#556B2F)", shoes: "Nike Air Force 1 white", accessories: ["Chain necklace", "Baseball cap", "Crossbody bag"], colors: ["#1A1A1A", "#556B2F", "#FFFFFF"], occasion: "City hangout", generatedImage: null },
    { name: "Hype Beast", description: "Bold statement streetwear", top: "Color-block hoodie red/black (#CC0000)", bottom: "Distressed straight jeans (#333)", shoes: "Jordan 1 Retro High", accessories: ["Beanie", "Ring set", "Duffel bag"], colors: ["#CC0000", "#1A1A1A", "#F5F5F5"], occasion: "Festival", generatedImage: null },
    { name: "Tech Street", description: "Futuristic urban utility", top: "Techwear jacket, matte black (#0D0D0D)", bottom: "Tapered joggers w/ zip detail (#2D2D2D)", shoes: "Triple black runners", accessories: ["Chest rig bag", "Digital watch", "Face mask"], colors: ["#0D0D0D", "#2D2D2D", "#00FF88"], occasion: "Night out", generatedImage: null },
  ],
  "minimal": [
    { name: "Clean Slate", description: "Perfectly pared back", top: "White cotton crew-neck tee (#FFF)", bottom: "Black slim-fit trousers (#0D0D0D)", shoes: "Common Projects Achilles Low", accessories: ["Thin gold chain", "Minimal watch", "Tote bag"], colors: ["#FFFFFF", "#0D0D0D", "#C9A84C"], occasion: "Everyday", generatedImage: null },
    { name: "Tonal Layer", description: "Monochrome sophistication", top: "Oatmeal knit sweater (#D4C5A9)", bottom: "Taupe wide-leg pants (#9B8E7E)", shoes: "Suede slide sandals", accessories: ["Linen scarf", "Ceramic bracelet"], colors: ["#D4C5A9", "#9B8E7E", "#F0EDE8"], occasion: "Cafe", generatedImage: null },
    { name: "Architectural", description: "Structured minimalism", top: "Structured grey blazer (#808080)", bottom: "Cropped black trousers (#1A1A1A)", shoes: "Pointed leather flats", accessories: ["Geometric earrings", "Leather portfolio"], colors: ["#808080", "#1A1A1A", "#C0C0C0"], occasion: "Creative meeting", generatedImage: null },
  ],
  "smart-casual": [
    { name: "Office Ready", description: "Polished professional ease", top: "Light blue Oxford shirt (#6B9BD2)", bottom: "Navy chinos, tailored fit (#1B2A4A)", shoes: "Brown derby shoes", accessories: ["Leather watch", "Woven belt", "Messenger bag"], colors: ["#6B9BD2", "#1B2A4A", "#8B4513"], occasion: "Office", generatedImage: null },
    { name: "Weekend Sharp", description: "Relaxed but refined", top: "Charcoal mock-neck sweater (#36454F)", bottom: "Dark wash slim jeans (#191970)", shoes: "Chelsea boots in tan", accessories: ["Aviator sunglasses", "Scarf", "Card holder"], colors: ["#36454F", "#191970", "#D2691E"], occasion: "Date night", generatedImage: null },
    { name: "Cocktail Edge", description: "Evening sophistication", top: "Silk-blend dark green shirt (#013220)", bottom: "Black tailored trousers (#0D0D0D)", shoes: "Patent leather loafers", accessories: ["Cufflinks", "Tie bar", "Leather clutch"], colors: ["#013220", "#0D0D0D", "#C0C0C0"], occasion: "Cocktail party", generatedImage: null },
  ],
  "luxury": [
    { name: "Haute Minimal", description: "Understated luxury", top: "Black silk crepe blouse (#0D0D0D)", bottom: "High-waist wool trousers (#1A1A1A)", shoes: "Pointed-toe stilettos", accessories: ["Diamond studs", "Gold cuff", "Birkin-style bag"], colors: ["#0D0D0D", "#1A1A1A", "#C9A84C"], occasion: "Gala dinner", generatedImage: null },
    { name: "Runway Ready", description: "Fashion week worthy", top: "Embellished tweed jacket (#2C2C2C)", bottom: "Leather pencil skirt (#722F37)", shoes: "Crystal-embellished mules", accessories: ["Statement necklace", "Silk gloves", "Minaudière"], colors: ["#2C2C2C", "#722F37", "#FFD700"], occasion: "Premiere", generatedImage: null },
    { name: "Elite Lounge", description: "Casual opulence", top: "Cashmere oversized coat (#D4C5A9)", bottom: "Drape-front satin pants (#0D0D0D)", shoes: "Velvet platform loafers", accessories: ["Cartier-style bracelet", "Silk headband", "Logo belt"], colors: ["#D4C5A9", "#0D0D0D", "#B8860B"], occasion: "VIP event", generatedImage: null },
  ],
  "sport": [
    { name: "Athleisure Core", description: "Gym to street ready", top: "Performance zip-up jacket (#1E1E1E)", bottom: "Tapered track pants (#2D2D2D)", shoes: "Nike React running shoes", accessories: ["Sport watch", "Gym bag", "Headband"], colors: ["#1E1E1E", "#00D4FF", "#F0F0F0"], occasion: "Gym, errands", generatedImage: null },
    { name: "Training Mode", description: "High performance gear", top: "Compression tank top (#FF6B00)", bottom: "Stretch shorts w/ liner (#1E1E1E)", shoes: "Cross-training sneakers", accessories: ["Sweatband", "Water bottle", "AirPods"], colors: ["#FF6B00", "#1E1E1E", "#FFFFFF"], occasion: "Workout", generatedImage: null },
    { name: "Sport Luxe", description: "Elevated athletic", top: "Merino wool athletic polo (#2D2D2D)", bottom: "Tailored joggers (#C9A84C trim)", shoes: "Leather-trimmed sneakers", accessories: ["Ceramic watch", "Zip wallet", "Sunglasses"], colors: ["#2D2D2D", "#C9A84C", "#EFEFEF"], occasion: "Sport club", generatedImage: null },
  ],
};

export function generateMockOutfits(styleId: string) {
  const outfits = OUTFIT_DATABASE[styleId] || OUTFIT_DATABASE["minimal"];
  return outfits.map(o => ({ ...o, generatedImage: null as string | null }));
}

// ─── DATABASE SCHEMA (for Supabase / Planetscale / etc.) ───
export const DB_SCHEMA = `
-- Users table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free','pro','unlimited')),
  credits       INTEGER DEFAULT 1,
  stripe_id     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Generations table
CREATE TABLE generations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  style         TEXT NOT NULL,
  analysis      JSONB NOT NULL,
  outfits       JSONB NOT NULL,
  image_url     TEXT,
  product_url   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Favorites table
CREATE TABLE favorites (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  outfit_index  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, generation_id, outfit_index)
);

-- Subscriptions table (Stripe)
CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_sub_id     TEXT UNIQUE,
  stripe_price_id   TEXT,
  status            TEXT DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);
`;
