"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { Check } from "lucide-react";

export default function PricingPage() {
  const { user, upgrade } = useStore();

  const plans = [
    {
      name: "Free", price: "$0", period: "forever", highlight: false,
      features: ["1 outfit generation", "All 6 style profiles", "AI skin tone analysis", "3 outfit variations", "Basic resolution"],
      cta: user?.plan === "free" ? "Current Plan" : "Get Started",
    },
    {
      name: "Pro", price: "$12", period: "/month", highlight: true,
      features: ["50 generations / month", "All 6 style profiles", "AI skin tone analysis", "3 outfit variations per gen", "HD resolution output", "Product integration", "Priority processing", "Save & export history"],
      cta: user?.plan === "pro" ? "Current Plan" : "Upgrade to Pro",
    },
    {
      name: "Unlimited", price: "$29", period: "/month", highlight: false,
      features: ["Unlimited generations", "Everything in Pro", "Ultra HD resolution", "Batch generation", "API access", "Custom style profiles", "Dedicated support", "Commercial license"],
      cta: "Contact Sales",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-[1100px] mx-auto"
      style={{ padding: "60px 24px 120px" }}
    >
      <div className="text-center mb-16">
        <p className="text-[13px] font-semibold uppercase tracking-[2px] mb-3" style={{ color: "var(--accent)" }}>
          Pricing
        </p>
        <h1 className="font-serif font-normal mb-4" style={{ fontSize: "clamp(32px, 5vw, 48px)" }}>
          Simple, transparent <span style={{ fontStyle: "italic" }}>pricing</span>
        </h1>
        <p className="text-base max-w-[500px] mx-auto" style={{ color: "var(--text-muted)" }}>
          Start free. Upgrade when you're ready for more.
        </p>
      </div>

      <div className="grid gap-5 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {plans.map((plan, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12 }}
            className="hover-lift relative overflow-hidden rounded-[22px]"
            style={{
              padding: 36,
              background: "var(--bg-card)",
              border: `${plan.highlight ? 2 : 1}px solid ${plan.highlight ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            {plan.highlight && (
              <div
                className="absolute top-4 right-4 text-white text-[11px] font-bold tracking-wide px-3.5 py-1 rounded-lg"
                style={{ background: "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" }}
              >
                POPULAR
              </div>
            )}

            <div className="text-sm font-semibold mb-2" style={{ color: "var(--text-muted)" }}>{plan.name}</div>
            <div className="flex items-baseline gap-1 mb-1">
              <span className="font-serif text-[44px] font-normal">{plan.price}</span>
              <span className="text-sm" style={{ color: "var(--text-dim)" }}>{plan.period}</span>
            </div>

            <div className="pt-5 mt-5" style={{ borderTop: "1px solid var(--border)" }}>
              {plan.features.map((f, j) => (
                <div key={j} className="flex items-center gap-2.5 py-2 text-sm" style={{ color: "var(--text-muted)" }}>
                  <span style={{ color: "var(--accent)" }}><Check size={16} /></span> {f}
                </div>
              ))}
            </div>

            <button
              className={plan.highlight ? "btn-primary w-full mt-6" : "btn-secondary w-full mt-6"}
              onClick={plan.highlight && user?.plan !== "pro" ? upgrade : undefined}
              disabled={plan.cta.includes("Current")}
              style={{ opacity: plan.cta.includes("Current") ? 0.5 : 1, cursor: plan.cta.includes("Current") ? "default" : "pointer" }}
            >
              {plan.cta}
            </button>
          </motion.div>
        ))}
      </div>

      <div
        className="text-center max-w-[600px] mx-auto mt-12 rounded-[14px]"
        style={{ padding: 24, background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          🔒 Payments secured by <strong>Stripe</strong>. Cancel anytime. No hidden fees.
          <br />All plans include a 7-day money-back guarantee.
        </div>
      </div>
    </motion.div>
  );
}
