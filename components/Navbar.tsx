"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sparkles, Sun, Moon, ChevronDown } from "lucide-react";

export default function Navbar({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { darkMode, toggleDarkMode, user, logout, setShowAuth } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className="glass fixed top-0 left-0 right-0 z-50 px-6 h-16 flex items-center justify-between"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 cursor-pointer"
        onClick={() => onNavigate(user ? "dashboard" : "landing")}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
          style={{ background: "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" }}
        >
          <Sparkles size={16} />
        </div>
        <span className="font-serif text-xl font-bold tracking-tight">Outfitly</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Credit counter */}
        {user && (
          <div
            className="font-mono flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] mr-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <span style={{ color: "var(--accent)" }} className="font-semibold">
              {user.plan === "pro" || user.plan === "unlimited" ? "∞" : user.credits}
            </span>
            <span style={{ color: "var(--text-muted)" }}>credits</span>
          </div>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-lg cursor-pointer border-none bg-transparent"
          style={{ color: "var(--text-muted)" }}
        >
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {user ? (
          <>
            <button
              onClick={() => onNavigate("pricing")}
              className="bg-transparent border-none cursor-pointer px-3 py-2 text-sm rounded-lg"
              style={{ color: "var(--text-muted)" }}
            >
              Pricing
            </button>
            <button
              onClick={() => onNavigate("history")}
              className="bg-transparent border-none cursor-pointer px-3 py-2 text-sm rounded-lg"
              style={{ color: "var(--text-muted)" }}
            >
              History
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-sm cursor-pointer"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{user.name}</span>
                <ChevronDown size={14} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute top-[calc(100%+8px)] right-0 rounded-[14px] p-2 min-w-[200px]"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div
                      className="px-3.5 py-2.5 text-[13px] mb-1"
                      style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
                    >
                      {user.email}
                      <br />
                      <span className="font-mono text-xs" style={{ color: "var(--accent)" }}>
                        {user.plan.toUpperCase()} plan
                      </span>
                    </div>
                    {["dashboard", "history", "pricing"].map((p) => (
                      <button
                        key={p}
                        onClick={() => { onNavigate(p); setMenuOpen(false); }}
                        className="block w-full text-left bg-transparent border-none px-3.5 py-2.5 rounded-lg cursor-pointer text-sm capitalize"
                        style={{ color: "var(--text)" }}
                      >
                        {p === "pricing" ? "Upgrade" : p}
                      </button>
                    ))}
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}>
                      <button
                        onClick={() => { logout(); onNavigate("landing"); setMenuOpen(false); }}
                        className="block w-full text-left bg-transparent border-none px-3.5 py-2.5 rounded-lg cursor-pointer text-sm"
                        style={{ color: "#E74C3C" }}
                      >
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : (
          <>
            <button className="btn-secondary !px-5 !py-2 !text-sm" onClick={() => setShowAuth("login")}>
              Log In
            </button>
            <button className="btn-primary !px-5 !py-2 !text-sm" onClick={() => setShowAuth("signup")}>
              Get Started
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
