import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// POST /api/stripe/checkout
// Creates a Stripe Checkout Session for subscription
// ═══════════════════════════════════════════════════════
//
// SETUP REQUIRED:
// 1. npm install stripe
// 2. Add STRIPE_SECRET_KEY to .env.local
// 3. Create products + prices in Stripe Dashboard
// 4. Add price IDs to .env.local
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const { plan, userId, email } = await request.json();

    // Uncomment after installing stripe:
    //
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    //
    // const priceId = plan === 'pro'
    //   ? process.env.STRIPE_PRO_PRICE_ID
    //   : process.env.STRIPE_UNLIMITED_PRICE_ID;
    //
    // const session = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   payment_method_types: ['card'],
    //   customer_email: email,
    //   line_items: [{ price: priceId, quantity: 1 }],
    //   success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    //   metadata: { userId },
    // });
    //
    // return NextResponse.json({ url: session.url });

    // Mock response for development
    return NextResponse.json({
      url: "/dashboard?upgraded=true",
      message: "Stripe not configured. Add STRIPE_SECRET_KEY to .env.local",
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
