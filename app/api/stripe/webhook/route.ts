import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════
// POST /api/stripe/webhook
// Handles Stripe webhook events for subscription lifecycle
// ═══════════════════════════════════════════════════════
//
// SETUP:
// 1. stripe listen --forward-to localhost:3000/api/stripe/webhook
// 2. Add webhook signing secret to STRIPE_WEBHOOK_SECRET
// 3. In Stripe Dashboard → Webhooks → Add endpoint:
//    URL: https://yourdomain.com/api/stripe/webhook
//    Events: checkout.session.completed,
//            customer.subscription.updated,
//            customer.subscription.deleted,
//            invoice.payment_succeeded,
//            invoice.payment_failed
// ═══════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    // Uncomment after installing stripe:
    //
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    //
    // let event;
    // try {
    //   event = stripe.webhooks.constructEvent(
    //     body,
    //     signature,
    //     process.env.STRIPE_WEBHOOK_SECRET
    //   );
    // } catch (err) {
    //   console.error('Webhook signature verification failed:', err.message);
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    // }
    //
    // switch (event.type) {
    //   case 'checkout.session.completed': {
    //     const session = event.data.object;
    //     const userId = session.metadata.userId;
    //     const subscriptionId = session.subscription;
    //
    //     // Update user plan in database
    //     // await db.users.update({
    //     //   where: { id: userId },
    //     //   data: {
    //     //     plan: 'pro',
    //     //     credits: 50,
    //     //     stripe_id: session.customer,
    //     //   },
    //     // });
    //     //
    //     // await db.subscriptions.create({
    //     //   data: {
    //     //     userId,
    //     //     stripe_sub_id: subscriptionId,
    //     //     status: 'active',
    //     //   },
    //     // });
    //     break;
    //   }
    //
    //   case 'customer.subscription.updated': {
    //     const subscription = event.data.object;
    //     // await db.subscriptions.update({
    //     //   where: { stripe_sub_id: subscription.id },
    //     //   data: {
    //     //     status: subscription.status,
    //     //     current_period_end: new Date(subscription.current_period_end * 1000),
    //     //   },
    //     // });
    //     break;
    //   }
    //
    //   case 'customer.subscription.deleted': {
    //     const subscription = event.data.object;
    //     // Downgrade user to free
    //     // const sub = await db.subscriptions.findUnique({ where: { stripe_sub_id: subscription.id } });
    //     // if (sub) {
    //     //   await db.users.update({
    //     //     where: { id: sub.userId },
    //     //     data: { plan: 'free', credits: 0 },
    //     //   });
    //     //   await db.subscriptions.update({
    //     //     where: { stripe_sub_id: subscription.id },
    //     //     data: { status: 'canceled' },
    //     //   });
    //     // }
    //     break;
    //   }
    //
    //   case 'invoice.payment_succeeded': {
    //     // Monthly renewal - reset credits
    //     const invoice = event.data.object;
    //     // const sub = await db.subscriptions.findUnique({ where: { stripe_sub_id: invoice.subscription } });
    //     // if (sub) {
    //     //   await db.users.update({
    //     //     where: { id: sub.userId },
    //     //     data: { credits: 50 },
    //     //   });
    //     // }
    //     break;
    //   }
    //
    //   case 'invoice.payment_failed': {
    //     // Handle failed payment - notify user
    //     break;
    //   }
    // }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
