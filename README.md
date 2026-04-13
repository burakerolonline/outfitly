# ✨ Outfitly — AI Outfit Generator

A premium AI-powered fashion styling SaaS application. Users upload their photo, choose a style, and AI generates photorealistic outfit recommendations matched to their skin tone, body type, and personal aesthetic.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Framer Motion](https://img.shields.io/badge/Framer_Motion-11-purple)

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ installed ([download](https://nodejs.org))
- **Git** installed
- A package manager: `npm`, `yarn`, or `pnpm`

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/outfitly.git
cd outfitly
npm install
```

### 2. Set Up Environment

```bash
cp .env.example .env.local
```

The app works **immediately without any API keys** — it uses mock data for the AI pipeline. Add real keys later when you're ready for production.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the app is running!

---

## 📁 Project Structure

```
outfitly/
├── app/
│   ├── api/
│   │   ├── generate/
│   │   │   └── route.ts          # AI generation endpoint
│   │   └── stripe/
│   │       ├── checkout/
│   │       │   └── route.ts      # Stripe checkout session
│   │       └── webhook/
│   │           └── route.ts      # Stripe webhook handler
│   ├── globals.css               # Tailwind + custom styles
│   ├── layout.tsx                # Root layout with metadata
│   └── page.tsx                  # App shell & routing
├── components/
│   ├── Navbar.tsx                # Navigation bar
│   ├── AuthModal.tsx             # Login / Signup modal
│   ├── PaywallModal.tsx          # Credit exhaustion paywall
│   ├── LandingPage.tsx           # Hero + features + CTA
│   ├── DashboardPage.tsx         # Upload + style select + generate
│   ├── ResultsPage.tsx           # Outfits + before/after slider
│   ├── PricingPage.tsx           # Plan comparison
│   └── HistoryPage.tsx           # Past generations
├── lib/
│   ├── store.ts                  # Zustand global state
│   └── constants.ts              # Styles, AI prompts, mock data, DB schema
├── public/                       # Static assets
├── .env.example                  # Environment variable template
├── .gitignore
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 🎯 Features

| Feature | Status |
|---------|--------|
| Landing page with animated hero | ✅ Working |
| Sign up / Login / Logout auth | ✅ Working (client-side) |
| Photo upload (drag & drop) | ✅ Working |
| 6 style profiles with color palettes | ✅ Working |
| Optional product image/URL input | ✅ Working |
| AI analysis (skin tone, face, body) | ✅ Mock (plug in real API) |
| 3 outfit variations per generation | ✅ Working |
| Before/After comparison slider | ✅ Working |
| Credit system (1 free, paywall) | ✅ Working |
| Pricing page (Free/Pro/Unlimited) | ✅ Working |
| Generation history | ✅ Working |
| Favorite outfits | ✅ Working |
| Dark / Light mode | ✅ Working |
| AI prompt templates | ✅ Included |
| Stripe checkout endpoint | ✅ Ready (uncomment) |
| Stripe webhook handler | ✅ Ready (uncomment) |
| Database schema | ✅ Included in constants.ts |

---

## 🧠 AI Integration Guide

The app has 3 AI integration points in `app/api/generate/route.ts`. Each is commented with ready-to-use code:

### Step 1: Image Analysis (Vision API)

Send the user's photo to detect skin tone, undertone, face shape, and body type.

**Recommended APIs:**
- **OpenAI GPT-4o Vision** — Best accuracy, $0.01/image
- **Anthropic Claude Vision** — Good alternative
- **Google Gemini Pro Vision** — Budget option

### Step 2: Outfit Generation (LLM)

Generate detailed outfit descriptions matched to the analysis.

**Recommended:** GPT-4o or Claude with the prompt templates in `lib/constants.ts`

### Step 3: Image Generation (Diffusion)

Render the outfit on the user's photo.

**Recommended APIs:**
- **Replicate** (Stable Diffusion XL + ControlNet) — Best for virtual try-on
- **Fashn.ai** — Specialized virtual try-on API
- **Kolors Virtual Try-On** — Open source option on Replicate

### Connecting a Real API

In `app/api/generate/route.ts`, uncomment the API call section for your chosen provider:

```typescript
// Example: OpenAI GPT-4o Vision
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: AI_PROMPTS.analysis() },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      ],
    }],
  }),
});
```

---

## 💳 Stripe Setup

### 1. Create Stripe Products

In [Stripe Dashboard](https://dashboard.stripe.com):
- Create a product called **"Outfitly Pro"** → Price: $12/month recurring
- Create a product called **"Outfitly Unlimited"** → Price: $29/month recurring
- Copy both Price IDs

### 2. Install Stripe

```bash
npm install stripe @stripe/stripe-js
```

### 3. Add Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_UNLIMITED_PRICE_ID=price_...
```

### 4. Test Webhooks Locally

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### 5. Uncomment Code

Uncomment the Stripe code in:
- `app/api/stripe/checkout/route.ts`
- `app/api/stripe/webhook/route.ts`

---

## 🗄️ Database Setup (Supabase)

### 1. Create Supabase Project

Go to [supabase.com](https://supabase.com) → New Project

### 2. Run Schema

Copy the SQL from `lib/constants.ts` (the `DB_SCHEMA` export) and run it in Supabase SQL Editor.

### 3. Add Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Install Supabase Client

```bash
npm install @supabase/supabase-js
```

---

## 🚢 Deploy to Vercel

### Method 1: GitHub Integration (Recommended)

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit - Outfitly AI Outfit Generator"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/outfitly.git
git push -u origin main
```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository
   - Framework: **Next.js** (auto-detected)
   - Add environment variables from `.env.local`
   - Click **Deploy**

3. **Done!** Your app is live at `https://outfitly.vercel.app`

### Method 2: Vercel CLI

```bash
npm install -g vercel
vercel login
vercel
```

### Post-Deploy Checklist

- [ ] Add all `.env` variables in Vercel → Project Settings → Environment Variables
- [ ] Update `NEXT_PUBLIC_APP_URL` to your Vercel domain
- [ ] Add Vercel domain to Stripe webhook endpoints
- [ ] Test the full flow: signup → upload → generate → results

---

## 🛠️ Development Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
```

---

## 📄 License

MIT — free for personal and commercial use.
