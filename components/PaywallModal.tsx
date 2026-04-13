"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { X } from "lucide-react";

export default function PaywallModal({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { showPaywall, setShowPaywall, upgrade } = useStore();

  if (!showPaywall) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setShowPaywall(false)}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: "var(--overlay)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-3xl p-10 w-full max-w-[440px] text-center relative"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.3)",
        }}
      >
        <button
          onClick={() => setShowPaywall(false)}
          className="absolute top-4 right-4 bg-transparent border-none cursor-pointer"
          style={{ color: "var(--text-dim)" }}
        >
          <X size={20} />
        </button>

        <div className="text-[56px] mb-4">✨</div>
        <h2 className="font-serif text-[28px] font-normal mb-2">You've used your free credit</h2>
        <p className="text-[15px] mb-8 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Upgrade to Pro for 50 generations per month, HD output, product integration, and more.
        </p>

        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex justify-center items-baseline gap-1 mb-2">
            <span className="font-serif text-4xl">$12</span>
            <span className="text-sm" style={{ color: "var(--text-dim)" }}>/month</span>
          </div>
          <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            50 generations · HD quality · Product integration
          </div>
        </div>

        <button className="btn-primary w-full !py-4 !text-base mb-3" onClick={upgrade}>
          Upgrade to Pro
        </button>
        <button
          onClick={() => { setShowPaywall(false); onNavigate("pricing"); }}
          className="bg-transparent border-none cursor-pointer text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          View all plans →
        </button>
      </motion.div>
    </motion.div>
  );
}
