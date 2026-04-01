import type { Metadata } from "next";
import { Sora, DM_Sans } from "next/font/google";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" data-theme="dark">
      <body className={`${sora.variable} ${dmSans.variable} font-sans antialiased`}>
        {/* ── Header ──────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-[--text-muted]/20 bg-[--bg-surface]/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            {/* Logo */}
            <Link
              href="/"
              className="shrink-0 text-lg font-bold tracking-tight text-[--text-primary]"
            >
              Cric<span className="text-[--accent-green]">Stats</span>
            </Link>

            {/* Search */}
            <SearchBar />

            {/* Nav links */}
            <nav className="hidden shrink-0 items-center gap-4 sm:flex">
              <Link
                href="/"
                className="text-sm font-medium text-[--text-secondary] transition hover:text-[--accent-green]"
              >
                Home
              </Link>
              <Link
                href="/teams"
                className="text-sm font-medium text-[--text-secondary] transition hover:text-[--accent-green]"
              >
                Teams
              </Link>
              <Link
                href="/compare"
                className="text-sm font-medium text-[--text-secondary] transition hover:text-[--accent-green]"
              >
                Compare
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>

        {/* ── Main content ────────────────────────────────── */}
        <main className="stadium-bg mx-auto max-w-6xl px-4 py-8">{children}</main>

        {/* ── Footer ──────────────────────────────────────── */}
        <footer className="border-t border-[--text-muted]/20 py-6 text-center text-sm text-[--text-muted]">
          Data sourced from{" "}
          <a
            href="https://cricsheet.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[--text-secondary]"
          >
            Cricsheet
          </a>
        </footer>
      </body>
    </html>
  );
}
