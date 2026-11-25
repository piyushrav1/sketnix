import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sketnix — Collaborative Visual Workspace",
  description: "Real-time collaborative visual workspace for brainstorming, diagrams, and team sessions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
