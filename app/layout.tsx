import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outfitly — AI Outfit Generator",
  description: "Upload your photo, choose a style, and let AI generate photorealistic outfits that match your skin tone, body type, and personal aesthetic.",
  openGraph: {
    title: "Outfitly — AI Outfit Generator",
    description: "AI-powered fashion styling. Upload a photo. Get styled instantly.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
