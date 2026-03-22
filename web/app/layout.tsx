import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CricStats — Cricket Statistics",
  description:
    "Explore ball-by-ball cricket statistics, player records, head-to-head matchups, and venue insights powered by Cricsheet data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* ── Header ──────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            {/* Logo */}
            <Link
              href="/"
              className="shrink-0 text-lg font-bold tracking-tight text-gray-900"
            >
              Cric<span className="text-blue-600">Stats</span>
            </Link>

            {/* Search */}
            <SearchBar />

            {/* Nav links */}
            <nav className="hidden shrink-0 items-center gap-4 sm:flex">
              <Link
                href="/"
                className="text-sm font-medium text-gray-600 transition hover:text-blue-600"
              >
                Home
              </Link>
              <Link
                href="/teams"
                className="text-sm font-medium text-gray-600 transition hover:text-blue-600"
              >
                Teams
              </Link>
            </nav>
          </div>
        </header>

        {/* ── Main content ────────────────────────────────── */}
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="border-t border-gray-100 py-6 text-center text-sm text-gray-400">
          Data sourced from{" "}
          <a
            href="https://cricsheet.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            Cricsheet
          </a>
        </footer>
      </body>
    </html>
  );
}
