"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import { STYLES } from "@/lib/constants";

export default function HistoryPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { history } = useStore();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-[900px] mx-auto"
      style={{ padding: "40px 24px 100px" }}
    >
      <h1 className="font-serif text-[32px] font-normal mb-2">Generation History</h1>
      <p className="text-sm mb-9" style={{ color: "var(--text-muted)" }}>
        All your past outfit generations
      </p>

      {history.length === 0 ? (
        <div
          className="text-center rounded-[20px]"
          style={{ padding: 80, background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="text-5xl mb-4">👗</div>
          <p className="text-base font-medium mb-2">No generations yet</p>
          <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
            Upload a photo and create your first outfit
          </p>
          <button className="btn-primary" onClick={() => onNavigate("dashboard")}>
            Go to Dashboard
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {history.map((item, i) => {
            const styleData = STYLES.find((s) => s.id === item.style);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="hover-lift rounded-[18px] cursor-pointer"
                style={{ padding: 24, background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[28px]">{styleData?.icon}</span>
                    <div>
                      <div className="text-base font-semibold">{styleData?.label} Collection</div>
                      <div className="text-xs" style={{ color: "var(--text-dim)" }}>{item.date}</div>
                    </div>
                  </div>
                  <div
                    className="font-mono text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: "var(--text-muted)", background: "var(--surface)" }}
                  >
                    {item.analysis.skinTone} · {item.analysis.undertone}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {item.outfits.map((o, j) => (
                    <div
                      key={j}
                      className="rounded-xl"
                      style={{ padding: 14, background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                      <div className="text-[13px] font-semibold mb-1.5">{o.name}</div>
                      <div className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                        {o.top}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {o.colors.map((c, k) => (
                          <div key={k} className="w-3 h-3 rounded-full" style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
