import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PRODUCT_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: TAGLINE,
};

export const viewport: Viewport = {
  themeColor: "#f6f7f9",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
