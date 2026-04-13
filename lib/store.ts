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
  confidence: string | number;
}

export interface Outfit {
  name: string;
  top: string;
  bottom: string;
  shoes: string;
  accessories: string[];
  colors: string[];
  generatedImage?: string | null;
}

export interface HistoryItem {
  id: number;
  style: string;
  outfits: Outfit[];
  analysis: Analysis;
  date: string;
  originalImage?: string;
}

interface AppState {
  darkMode: boolean;
  toggleDarkMode: () => void;

  user: UserState | null;
  showAuth: "login" | "signup" | null;
  setShowAuth: (v: "login" | "signup" | null) => void;
  login: (email: string, password: string) => void;
  signup: (email: string, password: string, name: string) => void;
  logout: () => void;
  upgrade: () => void;

  showPaywall: boolean;
  setShowPaywall: (v: boolean) => void;

  uploadedImage: string | null;
  setUploadedImage: (v: string | null) => void;
  selectedStyle: string | null;
  setSelectedStyle: (v: string | null) => void;
  productImage: string | null;
  setProductImage: (v: string | null) => void;
  productLink: string;
  setProductLink: (v: string) => void;

  generating: boolean;
  genStep: number;
  genError: string | null;
  analysis: Analysis | null;
  outfits: Outfit[] | null;
  setGenerating: (v: boolean) => void;
  setGenStep: (v: number) => void;
  setGenError: (v: string | null) => void;
  setAnalysis: (v: Analysis | null) => void;
  setOutfits: (v: Outfit[] | null) => void;
  consumeCredit: () => void;

  history: HistoryItem[];
  addHistory: (item: HistoryItem) => void;
  favorites: Set<string>;
  toggleFavorite: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  darkMode: true,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  user: null,
  showAuth: null,
  setShowAuth: (v) => set({ showAuth: v }),
  login: (email) => {
    set({
      user: { email, name: email.split("@")[0], credits: 1, plan: "free", id: Date.now() },
      showAuth: null,
    });
  },
  signup: (email, _, name) => {
    set({
      user: { email, name: name || email.split("@")[0], credits: 1, plan: "free", id: Date.now() },
      showAuth: null,
    });
  },
  logout: () => set({ user: null, uploadedImage: null, selectedStyle: null, outfits: null, analysis: null }),
  upgrade: () => set((s) => ({ user: s.user ? { ...s.user, credits: 50, plan: "pro" } : null, showPaywall: false })),

  showPaywall: false,
  setShowPaywall: (v) => set({ showPaywall: v }),

  uploadedImage: null,
  setUploadedImage: (v) => set({ uploadedImage: v }),
  selectedStyle: null,
  setSelectedStyle: (v) => set({ selectedStyle: v }),
  productImage: null,
  setProductImage: (v) => set({ productImage: v }),
  productLink: "",
  setProductLink: (v) => set({ productLink: v }),

  generating: false,
  genStep: 0,
  genError: null,
  analysis: null,
  outfits: null,
  setGenerating: (v) => set({ generating: v }),
  setGenStep: (v) => set({ genStep: v }),
  setGenError: (v) => set({ genError: v }),
  setAnalysis: (v) => set({ analysis: v }),
  setOutfits: (v) => set({ outfits: v }),
  consumeCredit: () => set((s) => ({
    user: s.user && s.user.plan === "free" ? { ...s.user, credits: Math.max(0, s.user.credits - 1) } : s.user,
  })),

  history: [],
  addHistory: (item) => set((s) => ({ history: [item, ...s.history] })),
  favorites: new Set(),
  toggleFavorite: (id) => set((s) => {
    const next = new Set(s.favorites);
    next.has(id) ? next.delete(id) : next.add(id);
    return { favorites: next };
  }),
}));
