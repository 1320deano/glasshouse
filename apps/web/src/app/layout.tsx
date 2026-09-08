import type { Metadata, Viewport } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import { PRODUCT_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

/**
 * Two faces, both self-hosted by Next at build time so the Room still renders offline.
 *   Geist          the UI face. Anthropic Sans credits "BSPK x Geist x Anthropic"; Geist is the open
 *                  face closest to it, and it is what the whole product is set in.
 *   Source Serif 4 the one serif, used for the greeting-style title at the top of the story and
 *                  nothing else, the way Claude sets its "Good afternoon" line.
 */
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", display: "swap", weight: ["400", "500"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: TAGLINE,
};

export const viewport: Viewport = {
  themeColor: "#f5f4ee",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
