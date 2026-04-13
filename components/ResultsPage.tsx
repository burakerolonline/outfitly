"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { STYLES, AI_PROMPTS } from "@/lib/constants";
import { Heart, Share2, Download, Check } from "lucide-react";

export default function ResultsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { outfits, analysis, selectedStyle, uploadedImage, favorites, toggleFavorite, productImage, productLink } = useStore();
  const [activeTab, setActiveTab] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const styleData = STYLES.find((s) => s.id === selectedStyle);

  const handleSlider = useCallback((e: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => {
    const rect = sliderRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = "clientX" in e ? e.clientX : (e as TouchEvent).touches?.[0]?.clientX;
    if (clientX === undefined) return;
    const x = clientX - rect.left;
    setSliderPos(Math.min(100, Math.max(0, (x / rect.width) * 100)));
  }, []);

  if (!outfits || !analysis) return null;

  const labels = ["Safe Stylish", "Trendy Bold", "Premium Luxury"];
  const labelIcons = ["🎯", "🔥", "💎"];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-[1000px] mx-auto"
      style={{ padding: "40px 24px 100px" }}
    >
      <button
        onClick={() => onNavigate("dashboard")}
        className="bg-transparent border-none cursor-pointer text-sm mb-6 flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        ← Back to Dashboard
      </button>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-9">
        <div>
          <h1 className="font-serif font-normal mb-2" style={{ fontSize: "clamp(28px, 4vw, 38px)" }}>
            Your <span className="gradient-text" style={{ fontStyle: "italic" }}>{styleData?.label}</span> outfits
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            3 variations generated — tap to explore each look
          </p>
        </div>
        <button className="btn-primary !py-3 !px-7 !text-sm" onClick={() => onNavigate("dashboard")}>
          Generate Again
        </button>
      </div>

      {/* ANALYSIS CARD */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-[18px] p-6 mb-8"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div
          className="text-[13px] font-semibold uppercase tracking-[1.5px] mb-3.5"
          style={{ color: "var(--accent)" }}
        >
          AI Analysis
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
          {[
            { label: "Skin Tone", value: analysis.skinTone },
            { label: "Undertone", value: analysis.undertone },
            { label: "Face Shape", value: analysis.faceShape },
            { label: "Body Type", value: analysis.bodyType },
            { label: "Hair", value: analysis.hairColor },
            { label: "Confidence", value: `${analysis.confidence}%` },
          ].map((item, i) => (
            <div key={i}>
              <div className="text-[11px] uppercase tracking-[1px] mb-1" style={{ color: "var(--text-dim)" }}>
                {item.label}
              </div>
              <div className="text-[15px] font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* OUTFIT TABS */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {outfits.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl cursor-pointer text-sm font-semibold transition-all duration-200"
            style={{
              border: `1px solid ${activeTab === i ? "var(--accent)" : "var(--border)"}`,
              background: activeTab === i ? "var(--accent-dim)" : "var(--bg-card)",
              color: activeTab === i ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {labelIcons[i]} {labels[i]}
          </button>
        ))}
      </div>

      {/* ACTIVE OUTFIT */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="rounded-[22px] overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {/* Before / After Slider */}
          {uploadedImage && (
            <div
              ref={sliderRef}
              className="relative overflow-hidden select-none cursor-col-resize"
              style={{ height: 320 }}
              onMouseDown={() => {
                const move = (e: MouseEvent) => handleSlider(e);
                const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
                document.addEventListener("mousemove", move);
                document.addEventListener("mouseup", up);
              }}
              onTouchMove={handleSlider}
            >
              {/* After */}
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${outfits[activeTab].colors[0]}33, ${outfits[activeTab].colors[1]}33, ${outfits[activeTab].colors[2]}33)`,
                }}
              >
                <div
                  className="px-6 py-3 rounded-xl text-white text-lg font-bold"
                  style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)" }}
                >
                  {outfits[activeTab].name}
                </div>
              </div>

              {/* Before */}
              <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                <img src={uploadedImage} alt="Before" className="w-full h-full object-cover" />
                <div
                  className="absolute bottom-4 left-4 text-xs font-semibold text-white px-3.5 py-1.5 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
                >
                  BEFORE
                </div>
              </div>

              {/* Slider handle */}
              <div
                className="absolute top-0 bottom-0 z-10"
                style={{ left: `${sliderPos}%`, width: 3, background: "var(--accent)", transform: "translateX(-50%)" }}
              >
                <div
                  className="absolute top-1/2 left-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white text-base font-bold"
                  style={{
                    transform: "translate(-50%,-50%)",
                    background: "var(--accent)",
                    boxShadow: "0 4px 16px rgba(201,168,76,0.4)",
                  }}
                >
                  ⇔
                </div>
              </div>
              <div
                className="absolute bottom-4 right-4 text-xs font-semibold text-white px-3.5 py-1.5 rounded-lg"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
              >
                AFTER
              </div>
            </div>
          )}

          {/* Outfit Details */}
          <div style={{ padding: 32 }}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="font-serif text-[26px] font-normal">{outfits[activeTab].name}</div>
                <div className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
                  {labels[activeTab]} variation · {styleData?.label} style
                </div>
              </div>
              <div className="flex gap-2">
                {[
                  { icon: <Heart size={18} fill={favorites.has(`${activeTab}-${selectedStyle}`) ? "currentColor" : "none"} />, color: favorites.has(`${activeTab}-${selectedStyle}`) ? "#E74C3C" : undefined, action: () => toggleFavorite(`${activeTab}-${selectedStyle}`) },
                  { icon: <Share2 size={18} />, action: () => {} },
                  { icon: <Download size={18} />, action: () => {} },
                ].map((btn, i) => (
                  <button
                    key={i}
                    onClick={btn.action}
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center cursor-pointer border-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: btn.color || "var(--text-muted)",
                    }}
                  >
                    {btn.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Garments */}
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {[
                { label: "Top", value: outfits[activeTab].top },
                { label: "Bottom", value: outfits[activeTab].bottom },
                { label: "Shoes", value: outfits[activeTab].shoes },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-[14px]"
                  style={{ padding: 18, background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-1.5" style={{ color: "var(--accent)" }}>
                    {item.label}
                  </div>
                  <div className="text-sm leading-relaxed">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Accessories */}
            <div className="mb-5">
              <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-2.5" style={{ color: "var(--accent)" }}>
                Accessories
              </div>
              <div className="flex gap-2 flex-wrap">
                {outfits[activeTab].accessories.map((a, i) => (
                  <span
                    key={i}
                    className="px-4 py-2 rounded-[10px] text-[13px]"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-2.5" style={{ color: "var(--accent)" }}>
                Color Palette
              </div>
              <div className="flex gap-2">
                {outfits[activeTab].colors.map((c, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl" style={{ background: c, border: "1px solid var(--border)" }} />
                    <span className="font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* AI PROMPT PREVIEW */}
      <details
        className="mt-8 rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <summary className="px-6 py-4 cursor-pointer text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          View AI Prompt Template Used
        </summary>
        <pre
          className="font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-auto"
          style={{
            padding: "16px 24px",
            color: "var(--text-dim)",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            maxHeight: 300,
          }}
        >
          {AI_PROMPTS.generation({
            skinTone: analysis.skinTone,
            undertone: analysis.undertone,
            style: styleData?.label || "",
            bodyType: analysis.bodyType,
            faceShape: analysis.faceShape,
            hasProduct: !!(productImage || productLink),
            productDesc: productLink || "uploaded product image",
          })}
        </pre>
      </details>
    </motion.div>
  );
}
