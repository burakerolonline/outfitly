"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { Sparkles, X } from "lucide-react";

export default function AuthModal() {
  const { showAuth, setShowAuth, login, signup } = useStore();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");

  if (!showAuth) return null;

  const handleSubmit = () => {
    if (!email || !pass) return;
    if (showAuth === "login") login(email, pass);
    else signup(email, pass, name);
    setEmail("");
    setPass("");
    setName("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => setShowAuth(null)}
      className="fixed inset-0 z-[200] flex items-center justify-center p-6"
      style={{ background: "var(--overlay)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-3xl p-10 w-full max-w-[420px] relative"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.3)",
        }}
      >
        <button
          onClick={() => setShowAuth(null)}
          className="absolute top-4 right-4 bg-transparent border-none cursor-pointer"
          style={{ color: "var(--text-dim)" }}
        >
          <X size={20} />
        </button>

        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-[14px] inline-flex items-center justify-center mb-4 text-white"
            style={{ background: "linear-gradient(135deg, var(--gradient-1), var(--gradient-2))" }}
          >
            <Sparkles size={20} />
          </div>
          <h2 className="font-serif text-[28px] font-normal mb-1.5">
            {showAuth === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {showAuth === "login" ? "Sign in to your Outfitly account" : "Start with 1 free outfit generation"}
          </p>
        </div>

        <div className="flex flex-col gap-3.5">
          {showAuth === "signup" && (
            <input
              className="input-field"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="input-field"
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input-field"
            placeholder="Password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <button className="btn-primary w-full !py-4 !text-base mt-2" onClick={handleSubmit}>
            {showAuth === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <p className="text-center mt-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {showAuth === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <span
            onClick={() => setShowAuth(showAuth === "login" ? "signup" : "login")}
            className="cursor-pointer font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {showAuth === "login" ? "Sign up" : "Sign in"}
          </span>
        </p>
      </motion.div>
    </motion.div>
  );
}
