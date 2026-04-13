"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { STYLES } from "@/lib/constants";
import { Sparkles, ArrowRight, Check } from "lucide-react";

export default function LandingPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { user, setShowAuth } = useStore();

  const features = [
    { icon: "🎯", title: "AI Analysis", desc: "Detects skin tone, undertone, face shape & body type for perfect color matching" },
    { icon: "👔", title: "6 Style Profiles", desc: "From Old Money elegance to cutting-edge Streetwear — curated for you" },
    { icon: "✨", title: "3 Variations", desc: "Every generation gives you Safe, Trendy, and Premium outfit options" },
    { icon: "🛍️", title: "Product Integration", desc: "Upload any product and watch it styled naturally into your outfit" },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* HERO */}
      <section className="relative overflow-hidden text-center" style={{ padding: "120px 24px 100px" }}>
        <div
          className="absolute pointer-events-none"
          style={{ top: "10%", left: "5%", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.05) 0%, transparent 70%)" }}
        />
        <div
          className="absolute pointer-events-none"
          style={{ bottom: "5%", right: "5%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)" }}
        />

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <div
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-medium mb-8"
            style={{ border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}
          >
            <Sparkles size={14} /> AI-Powered Fashion Styling
          </div>
        </motion.div>

        <motion.h1
          className="font-serif mx-auto mb-7"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.8 }}
          style={{ fontSize: "clamp(42px, 7vw, 82px)", lineHeight: 1.05, fontWeight: 400, maxWidth: 900, letterSpacing: -2 }}
        >
          Your photo.{" "}
          <span className="gradient-text" style={{ fontStyle: "italic" }}>Your style.</span>
          <br />Perfectly dressed.
        </motion.h1>

        <motion.p
          className="mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          style={{ fontSize: 18, color: "var(--text-muted)", maxWidth: 560, lineHeight: 1.7 }}
        >
          Upload your photo, choose a style, and let AI generate photorealistic outfits that match your skin tone, body type, and personal aesthetic.
        </motion.p>

        <motion.div
          className="flex gap-4 justify-center flex-wrap"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8 }}
        >
          <button
            className="btn-primary !text-base !py-4 !px-10"
            onClick={() => user ? onNavigate("dashboard") : setShowAuth("signup")}
          >
            Try Now — It's Free
          </button>
          <button className="btn-secondary !text-base !py-4 !px-10" onClick={() => setShowAuth("login")}>
            Log In
          </button>
        </motion.div>

        {/* Style cards preview */}
        <motion.div
          className="flex gap-3 justify-center mt-20 flex-wrap px-5"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 1 }}
        >
          {STYLES.map((s, i) => (
            <motion.div
              key={s.id}
              className="hover-lift text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.08 }}
              style={{
                padding: "16px 22px",
                borderRadius: 16,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                minWidth: 110,
              }}
            >
              <div className="text-[28px] mb-1.5">{s.icon}</div>
              <div className="text-[13px] font-semibold tracking-wide">{s.label}</div>
              <div className="flex gap-1 justify-center mt-2">
                {s.colors.map((c, j) => (
                  <div
                    key={j}
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ background: c, border: "1px solid var(--border)" }}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-[1100px] mx-auto" style={{ padding: "100px 24px" }}>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          <p
            className="text-center text-[13px] font-semibold uppercase tracking-[2px] mb-3"
            style={{ color: "var(--accent)" }}
          >
            How It Works
          </p>
          <h2
            className="font-serif text-center mb-16 font-normal"
            style={{ fontSize: "clamp(32px, 5vw, 50px)", letterSpacing: -1 }}
          >
            Three steps to your <span style={{ fontStyle: "italic" }}>perfect look</span>
          </h2>
        </motion.div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {[
            { num: "01", title: "Upload", desc: "Drag & drop your photo. Our AI instantly analyzes your features — skin tone, face shape, body proportions." },
            { num: "02", title: "Choose Style", desc: "Pick from 6 curated style profiles. Each one is tuned to suggest colors and pieces that complement you." },
            { num: "03", title: "Generate", desc: "Get 3 photorealistic outfit variations — from safe & classic to bold & luxury — rendered on your photo." },
          ].map((step, i) => (
            <motion.div
              key={i}
              className="hover-lift relative"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              style={{
                padding: 36,
                borderRadius: 20,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="font-mono text-5xl font-bold absolute top-5 right-6"
                style={{ color: "var(--accent)", opacity: 0.2 }}
              >
                {step.num}
              </div>
              <div className="font-serif text-[28px] font-normal mb-3">{step.title}</div>
              <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="max-w-[1100px] mx-auto" style={{ padding: "80px 24px 120px" }}>
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              style={{
                padding: 28,
                borderRadius: 16,
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="text-[32px] mb-3.5">{f.icon}</div>
              <div className="text-base font-semibold mb-2">{f.title}</div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center" style={{ padding: "80px 24px 120px" }}>
        <div
          className="max-w-[600px] mx-auto rounded-3xl"
          style={{ padding: 48, background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <h2 className="font-serif text-4xl font-normal mb-4">Ready to get styled?</h2>
          <p className="text-[15px] mb-8" style={{ color: "var(--text-muted)" }}>
            Your first generation is free. No credit card required.
          </p>
          <button
            className="btn-primary !text-base !py-4 !px-12 inline-flex items-center gap-2"
            onClick={() => user ? onNavigate("dashboard") : setShowAuth("signup")}
          >
            Start Now <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="text-center" style={{ padding: "40px 24px", borderTop: "1px solid var(--border)" }}>
        <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>
          © 2026 Outfitly — AI-Powered Fashion Styling. Built with precision.
        </p>
      </footer>
    </motion.div>
  );
}
