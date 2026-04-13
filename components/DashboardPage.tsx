"use client";

import { motion } from "framer-motion";
import { useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { STYLES } from "@/lib/constants";
import { Sparkles, X, ImageIcon, Lock, Check } from "lucide-react";

export default function DashboardPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const {
    uploadedImage, setUploadedImage,
    selectedStyle, setSelectedStyle,
    productImage, setProductImage,
    productLink, setProductLink,
    generating, genStep,
    setGenerating, setGenStep,
    setAnalysis, setOutfits,
    consumeCredit, addHistory,
    user, setShowPaywall, setShowAuth,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((e: any) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setUploadedImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, [setUploadedImage]);

  const handleProductFile = useCallback((e: any) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setProductImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, [setProductImage]);

  const handleGenerate = async () => {
    if (!user) { setShowAuth("login"); return; }
    if (user.credits <= 0 && user.plan === "free") { setShowPaywall(true); return; }
    if (!uploadedImage || !selectedStyle) return;

    setGenerating(true);
    setGenStep(0);

    try {
      // Step 1: Show analyzing
      setGenStep(0);

      // Call the real API
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: uploadedImage,
          style: selectedStyle,
          productUrl: productLink || undefined,
        }),
      });

      // Step 2: Detecting
      setGenStep(1);
      await new Promise((r) => setTimeout(r, 800));

      if (!response.ok) {
        const err = await response.json();
        console.error("API error:", err);
        alert("Generation failed: " + (err.error || "Unknown error"));
        setGenerating(false);
        return;
      }

      const data = await response.json();

      // Step 3: Color matching
      setGenStep(2);
      setAnalysis(data.analysis);
      await new Promise((r) => setTimeout(r, 600));

      // Step 4: Generating outfits
      setGenStep(3);
      setOutfits(data.outfits);
      await new Promise((r) => setTimeout(r, 600));

      // Step 5: Done
      setGenStep(4);
      await new Promise((r) => setTimeout(r, 400));

      consumeCredit();
      addHistory({
        id: Date.now(),
        style: selectedStyle,
        outfits: data.outfits,
        analysis: data.analysis,
        date: new Date().toLocaleDateString(),
      });

      setGenerating(false);
      onNavigate("results");
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Something went wrong. Please try again.");
      setGenerating(false);
    }
  };

  const genSteps = [
    "Sending photo to AI...",
    "Analyzing skin tone & features...",
    "Matching color palettes...",
    "Generating outfit recommendations...",
    "Finalizing results...",
  ];
  const canGenerate = uploadedImage && selectedStyle;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-[960px] mx-auto"
      style={{ padding: "40px 24px 100px" }}
    >
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif mb-2 font-normal" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}>
          Create your <span className="gradient-text" style={{ fontStyle: "italic" }}>look</span>
        </h1>
        <p className="text-[15px] mb-10" style={{ color: "var(--text-muted)" }}>
          Upload a photo, pick a style, and let AI do the rest.
        </p>
      </motion.div>

      {/* STEP 1: UPLOAD */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-10">
        <StepHeader num="1" label="Upload your photo" active />

        {!uploadedImage ? (
          <div
            onDrop={handleFile}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-[20px] text-center cursor-pointer transition-all duration-300"
            style={{ border: "2px dashed var(--border)", padding: "60px 24px", background: "var(--bg-card)" }}
          >
            <div className="mb-4" style={{ color: "var(--text-dim)" }}>
              <ImageIcon size={48} strokeWidth={1} className="mx-auto" />
            </div>
            <p className="text-base font-medium mb-1.5">Drag & drop your photo here</p>
            <p className="text-[13px]" style={{ color: "var(--text-dim)" }}>or click to browse · JPG, PNG up to 10MB</p>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>
        ) : (
          <div className="relative inline-block rounded-[20px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <img src={uploadedImage} alt="Uploaded" className="block rounded-[20px]" style={{ maxHeight: 360, maxWidth: "100%" }} />
            <button onClick={() => setUploadedImage(null)} className="absolute top-3 right-3 w-9 h-9 rounded-[10px] flex items-center justify-center border-none cursor-pointer text-white" style={{ background: "rgba(0,0,0,0.6)" }}>
              <X size={18} />
            </button>
          </div>
        )}
      </motion.div>

      {/* STEP 2: STYLE */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-10">
        <StepHeader num="2" label="Choose your style" active />
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {STYLES.map((s) => {
            const active = selectedStyle === s.id;
            return (
              <motion.div key={s.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedStyle(s.id)}
                className="relative overflow-hidden cursor-pointer transition-all duration-200"
                style={{ padding: 20, borderRadius: 16, background: active ? "var(--accent-dim)" : "var(--bg-card)", border: `2px solid ${active ? "var(--accent)" : "var(--border)"}` }}
              >
                {active && (
                  <div className="absolute top-2.5 right-2.5 w-[22px] h-[22px] rounded-md flex items-center justify-center text-white" style={{ background: "var(--accent)" }}>
                    <Check size={14} />
                  </div>
                )}
                <div className="text-[32px] mb-2">{s.icon}</div>
                <div className="text-[15px] font-semibold mb-1">{s.label}</div>
                <div className="text-xs leading-snug" style={{ color: "var(--text-muted)" }}>{s.desc}</div>
                <div className="flex gap-1 mt-2.5">
                  {s.colors.map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full" style={{ background: c, border: "1px solid var(--border)" }} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* STEP 3: PRODUCT (Optional) */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-12">
        <div className="flex items-center gap-2.5 mb-4">
          <StepHeader num="3" label="Add a product" />
          <span className="text-xs font-normal px-2.5 py-0.5 rounded-md" style={{ color: "var(--text-dim)", background: "var(--surface)" }}>Optional</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            {!productImage ? (
              <div onClick={() => productInputRef.current?.click()} onDrop={handleProductFile} onDragOver={(e) => e.preventDefault()}
                className="rounded-[14px] text-center cursor-pointer" style={{ border: "1px dashed var(--border)", padding: 28, background: "var(--bg-card)" }}>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Upload product image</p>
                <input ref={productInputRef} type="file" accept="image/*" className="hidden" onChange={handleProductFile} />
              </div>
            ) : (
              <div className="relative rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <img src={productImage} alt="Product" className="w-full object-cover" style={{ height: 120 }} />
                <button onClick={() => setProductImage(null)} className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center border-none cursor-pointer text-white" style={{ background: "rgba(0,0,0,0.6)" }}>
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <input className="input-field h-full" placeholder="Or paste a product URL..." value={productLink} onChange={(e) => setProductLink(e.target.value)} style={{ minHeight: 80 }} />
        </div>
      </motion.div>

      {/* GENERATE */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        {!generating ? (
          <button className="btn-primary w-full !py-[18px] !text-[17px] !rounded-2xl flex items-center justify-center gap-2.5" onClick={handleGenerate} disabled={!canGenerate}>
            <Sparkles size={18} /> Generate Outfit
            {user && user.credits <= 0 && user.plan === "free" && <Lock size={14} className="ml-2 opacity-70" />}
          </button>
        ) : (
          <div className="rounded-2xl text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: 32 }}>
            <div className="mb-5 inline-block">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="w-12 h-12 rounded-full" style={{ border: "3px solid var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
            <div className="text-base font-semibold mb-4">{genSteps[genStep]}</div>
            <div className="flex gap-1.5 justify-center">
              {genSteps.map((_, i) => (
                <div key={i} className="h-1 rounded-sm transition-all duration-500" style={{ width: i <= genStep ? 32 : 20, background: i <= genStep ? "var(--accent)" : "var(--border)" }} />
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function StepHeader({ num, label, active = true }: { num: string; label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold" style={{
        background: active ? "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" : "var(--surface)",
        color: active ? "#fff" : "var(--text-muted)",
        border: active ? "none" : "1px solid var(--border)",
      }}>{num}</div>
      <span className="text-base font-semibold">{label}</span>
    </div>
  );
}
