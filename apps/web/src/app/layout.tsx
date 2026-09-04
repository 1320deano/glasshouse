import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PRODUCT_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: TAGLINE,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
