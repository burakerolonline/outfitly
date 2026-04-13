"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { STYLES, AI_PROMPTS } from "@/lib/constants";
import { Heart, Share2, Download, ImageIcon } from "lucide-react";

export default function ResultsPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { outfits, analysis, selectedStyle, uploadedImage, favorites, toggleFavorite, productLink, generationMode } = useStore();
  const [activeTab, setActiveTab] = useState(0);
  const styleData = STYLES.find((s) => s.id === selectedStyle);

  if (!outfits || !analysis) return null;

  const labels = ["Safe Stylish", "Trendy Bold", "Premium Luxury"];
  const labelIcons = ["🎯", "🔥", "💎"];
  const currentOutfit = outfits[activeTab];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-[1200px] mx-auto"
      style={{ padding: "40px 24px 100px" }}
    >
      <button
        onClick={() => onNavigate("dashboard")}
        className="bg-transparent border-none cursor-pointer text-sm mb-6 flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        ← Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="font-serif font-normal mb-2" style={{ fontSize: "clamp(28px, 4vw, 38px)" }}>
            Your <span className="gradient-text" style={{ fontStyle: "italic" }}>{styleData?.label}</span> outfits
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            AI analyzed your photo and generated 3 outfit variations with images
          </p>
        </div>
        <button className="btn-primary !py-3 !px-7 !text-sm" onClick={() => onNavigate("dashboard")}>
          Generate Again
        </button>
      </div>

      {/* AI Analysis Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[18px] p-6 mb-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="text-[13px] font-semibold uppercase tracking-[1.5px] mb-3" style={{ color: "var(--accent)" }}>
          🧠 AI Analysis — GPT-4o Vision
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          {[
            { label: "Skin Tone", value: analysis.skinTone },
            { label: "Undertone", value: analysis.undertone },
            { label: "Face Shape", value: analysis.faceShape },
            { label: "Body Type", value: analysis.bodyType },
            { label: "Hair", value: analysis.hairColor },
            { label: "Confidence", value: `${analysis.confidence}%` },
          ].map((item, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-[1px] mb-1" style={{ color: "var(--text-dim)" }}>{item.label}</div>
              <div className="text-[15px] font-semibold">{item.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Outfit Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {outfits.map((_: any, i: number) => (
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

      {/* ═══════════════════════════════════════════════ */}
      {/* MAIN CONTENT: Before / After Side by Side      */}
      {/* ═══════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
        >
          {/* BEFORE / AFTER IMAGES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">

            {/* ── LEFT: Original Photo ── */}
            <div
              className="rounded-[20px] overflow-hidden"
              style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
            >
              <div
                className="px-4 py-3 text-[11px] font-bold uppercase tracking-[2px] text-center"
                style={{ background: "var(--surface)", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
              >
                📷 Your Original Photo
              </div>
              <div className="p-4 flex justify-center items-center" style={{ minHeight: 400 }}>
                {uploadedImage ? (
                  <img
                    src={uploadedImage}
                    alt="Original"
                    className="rounded-2xl object-contain max-w-full"
                    style={{ maxHeight: 500 }}
                  />
                ) : (
                  <div className="text-center" style={{ color: "var(--text-dim)" }}>
                    <ImageIcon size={48} strokeWidth={1} className="mx-auto mb-2" />
                    <p className="text-sm">No photo</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: AI Generated Image ── */}
            <div
              className="rounded-[20px] overflow-hidden"
              style={{ border: "2px solid var(--accent)", background: "var(--bg-card)" }}
            >
              <div
                className="px-4 py-3 text-[11px] font-bold uppercase tracking-[2px] text-center text-white"
                style={{ background: "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" }}
              >
                ✨ AI STYLED — {currentOutfit?.name}
              </div>
              <div className="p-4 flex justify-center items-center" style={{ minHeight: 400 }}>
                {currentOutfit?.generatedImage ? (
                  <img
                    src={currentOutfit.generatedImage}
                    alt={`AI Generated: ${currentOutfit.name}`}
                    className="rounded-2xl object-contain max-w-full"
                    style={{ maxHeight: 500 }}
                  />
                ) : (
                  /* Fallback: text-based outfit display when no image */
                  <div className="w-full p-5 space-y-3">
                    <div className="text-center mb-4">
                      <div className="text-5xl mb-2">{labelIcons[activeTab]}</div>
                      <div className="font-serif text-xl mb-1">{currentOutfit?.name}</div>
                      <div className="text-xs px-3 py-1 rounded-full inline-block" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                        Image generation requires OPENAI_API_KEY
                      </div>
                    </div>
                    {[
                      { emoji: "👕", label: "TOP", value: currentOutfit?.top },
                      { emoji: "👖", label: "BOTTOM", value: currentOutfit?.bottom },
                      { emoji: "👟", label: "SHOES", value: currentOutfit?.shoes },
                      { emoji: "💍", label: "ACCESSORIES", value: currentOutfit?.accessories?.join(" · ") },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <span className="text-lg">{item.emoji}</span>
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: "var(--accent)" }}>{item.label}</div>
                          <div className="text-sm leading-snug mt-0.5">{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* OUTFIT DETAILS CARD */}
          <div
            className="rounded-[22px] overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div style={{ padding: "24px 28px" }}>
              {/* Title + Actions */}
              <div className="flex justify-between items-center mb-5">
                <div>
                  <div className="font-serif text-2xl font-normal">{currentOutfit?.name}</div>
                  <div className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
                    {currentOutfit?.description}
                    {currentOutfit?.occasion && <> · Best for: <strong>{currentOutfit.occasion}</strong></>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleFavorite(`${activeTab}-${selectedStyle}`)}
                    className="w-10 h-10 rounded-[10px] flex items-center justify-center cursor-pointer"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: favorites.has(`${activeTab}-${selectedStyle}`) ? "#E74C3C" : "var(--text-muted)" }}>
                    <Heart size={18} fill={favorites.has(`${activeTab}-${selectedStyle}`) ? "currentColor" : "none"} />
                  </button>
                  <button className="w-10 h-10 rounded-[10px] flex items-center justify-center cursor-pointer"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    <Share2 size={18} />
                  </button>
                  {currentOutfit?.generatedImage && (
                    <a href={currentOutfit.generatedImage} target="_blank" rel="noopener noreferrer" download
                      className="w-10 h-10 rounded-[10px] flex items-center justify-center cursor-pointer"
                      style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      <Download size={18} />
                    </a>
                  )}
                </div>
              </div>

              {/* Garment Details */}
              <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {[
                  { label: "Top", value: currentOutfit?.top },
                  { label: "Bottom", value: currentOutfit?.bottom },
                  { label: "Shoes", value: currentOutfit?.shoes },
                ].map((item, i) => (
                  <div key={i} className="rounded-[14px] p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-1" style={{ color: "var(--accent)" }}>{item.label}</div>
                    <div className="text-sm leading-relaxed">{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Accessories */}
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-2" style={{ color: "var(--accent)" }}>Accessories</div>
                <div className="flex gap-2 flex-wrap">
                  {currentOutfit?.accessories?.map((a: string, i: number) => (
                    <span key={i} className="px-3.5 py-1.5 rounded-[10px] text-[13px]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>{a}</span>
                  ))}
                </div>
              </div>

              {/* Color Palette */}
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[1px] mb-2" style={{ color: "var(--accent)" }}>Color Palette</div>
                <div className="flex gap-3">
                  {currentOutfit?.colors?.map((c: string, i: number) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-xl" style={{ background: c, border: "1px solid var(--border)" }} />
                      <span className="font-mono text-[10px]" style={{ color: "var(--text-dim)" }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* AI Prompt Preview */}
          <details className="mt-6 rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <summary className="px-6 py-4 cursor-pointer text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
              View AI Prompts Used (GPT-4o + gpt-image-1)
            </summary>
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-auto"
              style={{ padding: "16px 24px", color: "var(--text-dim)", borderTop: "1px solid var(--border)", background: "var(--surface)", maxHeight: 300 }}>
              {AI_PROMPTS.generation({
                skinTone: analysis.skinTone, undertone: analysis.undertone,
                style: styleData?.label || "", bodyType: analysis.bodyType,
                faceShape: analysis.faceShape, hasProduct: !!productLink,
                productDesc: productLink || "none",
              })}
            </pre>
          </details>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
