"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import Navbar from "@/components/Navbar";
import AuthModal from "@/components/AuthModal";
import PaywallModal from "@/components/PaywallModal";
import LandingPage from "@/components/LandingPage";
import DashboardPage from "@/components/DashboardPage";
import ResultsPage from "@/components/ResultsPage";
import PricingPage from "@/components/PricingPage";
import HistoryPage from "@/components/HistoryPage";

export default function Home() {
  const [page, setPage] = useState("landing");
  const { darkMode, user, showAuth, showPaywall } = useStore();

  // Apply theme class to html element
  useEffect(() => {
    document.documentElement.classList.toggle("light", !darkMode);
  }, [darkMode]);

  // Redirect to dashboard after login
  useEffect(() => {
    if (user && page === "landing") setPage("dashboard");
  }, [user]);

  const onNavigate = (p: string) => setPage(p);

  return (
    <>
      <Navbar onNavigate={onNavigate} />

      <div className="pt-16">
        <AnimatePresence mode="wait">
          {page === "landing" && <LandingPage key="landing" onNavigate={onNavigate} />}
          {page === "dashboard" && <DashboardPage key="dashboard" onNavigate={onNavigate} />}
          {page === "results" && <ResultsPage key="results" onNavigate={onNavigate} />}
          {page === "pricing" && <PricingPage key="pricing" />}
          {page === "history" && <HistoryPage key="history" onNavigate={onNavigate} />}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showAuth && <AuthModal key="auth" />}
      </AnimatePresence>

      <AnimatePresence>
        {showPaywall && <PaywallModal key="paywall" onNavigate={onNavigate} />}
      </AnimatePresence>
    </>
  );
}
