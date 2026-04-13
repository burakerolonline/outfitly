import { create } from "zustand";

export interface UserState {
  email: string;
  name: string;
  credits: number;
  plan: "free" | "pro" | "unlimited";
  id: number;
}

export interface Analysis {
  skinTone: string;
  undertone: string;
  faceShape: string;
  bodyType: string;
  hairColor: string;
  confidence: string;
}

export interface Outfit {
  name: string;
  top: string;
  bottom: string;
  shoes: string;
  accessories: string[];
  colors: string[];
}

export interface HistoryItem {
  id: number;
  style: string;
  outfits: Outfit[];
  analysis: Analysis;
  date: string;
}

interface AppState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;

  // Auth
  user: UserState | null;
  showAuth: "login" | "signup" | null;
  setShowAuth: (v: "login" | "signup" | null) => void;
  login: (email: string, password: string) => void;
  signup: (email: string, password: string, name: string) => void;
  logout: () => void;
  upgrade: () => void;

  // Paywall
  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;

  // Dashboard
  uploadedImage: string | null;
  setUploadedImage: (v: string | null) => void;
  selectedStyle: string | null;
  setSelectedStyle: (v: string | null) => void;
  productImage: string | null;
  setProductImage: (v: string | null) => void;
  productLink: string;
  setProductLink: (v: string) => void;

  // Generation
  generating: boolean;
  genStep: number;
  analysis: Analysis | null;
  outfits: Outfit[] | null;
  setGenerating: (v: boolean) => void;
  setGenStep: (v: number) => void;
  setAnalysis: (v: Analysis | null) => void;
  setOutfits: (v: Outfit[] | null) => void;
  consumeCredit: () => void;

  // History & Favorites
  history: HistoryItem[];
  addHistory: (item: HistoryItem) => void;
  favorites: Set<string>;
  toggleFavorite: (id: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Theme
  darkMode: true,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  // Auth
  user: null,
  showAuth: null,
  setShowAuth: (v) => set({ showAuth: v }),
  login: (email, password) => {
    set({
      user: { email, name: email.split("@")[0], credits: 1, plan: "free", id: Date.now() },
      showAuth: null,
    });
  },
  signup: (email, password, name) => {
    set({
      user: { email, name: name || email.split("@")[0], credits: 1, plan: "free", id: Date.now() },
      showAuth: null,
    });
  },
  logout: () => {
    set({
      user: null,
      uploadedImage: null,
      selectedStyle: null,
      outfits: null,
      analysis: null,
    });
  },
  upgrade: () => {
    set((s) => ({
      user: s.user ? { ...s.user, credits: 50, plan: "pro" } : null,
      showPaywall: false,
    }));
  },

  // Paywall
  showPaywall: false,
  setShowPaywall: (v) => set({ showPaywall: v }),

  // Dashboard
  uploadedImage: null,
  setUploadedImage: (v) => set({ uploadedImage: v }),
  selectedStyle: null,
  setSelectedStyle: (v) => set({ selectedStyle: v }),
  productImage: null,
  setProductImage: (v) => set({ productImage: v }),
  productLink: "",
  setProductLink: (v) => set({ productLink: v }),

  // Generation
  generating: false,
  genStep: 0,
  analysis: null,
  outfits: null,
  setGenerating: (v) => set({ generating: v }),
  setGenStep: (v) => set({ genStep: v }),
  setAnalysis: (v) => set({ analysis: v }),
  setOutfits: (v) => set({ outfits: v }),
  consumeCredit: () => {
    set((s) => ({
      user: s.user && s.user.plan === "free"
        ? { ...s.user, credits: Math.max(0, s.user.credits - 1) }
        : s.user,
    }));
  },

  // History & Favorites
  history: [],
  addHistory: (item) => set((s) => ({ history: [item, ...s.history] })),
  favorites: new Set(),
  toggleFavorite: (id) =>
    set((s) => {
      const next = new Set(s.favorites);
      next.has(id) ? next.delete(id) : next.add(id);
      return { favorites: next };
    }),
}));
