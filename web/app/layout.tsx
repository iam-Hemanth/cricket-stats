import type { Metadata } from "next";
import { Sora, DM_Sans, Playfair_Display, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
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

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "900"],
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

import GlobalLayout from "@/components/GlobalLayout";
import StartupLoader from "@/components/StartupLoader";

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
      <body className={`${sora.variable} ${dmSans.variable} ${playfairDisplay.variable} ${jetbrainsMono.variable} ${plusJakartaSans.variable} font-sans antialiased`}>
        <StartupLoader />
        <GlobalLayout
          header={
            <header className="sticky top-0 z-40 border-b border-glass-border bg-bg-surface/80 backdrop-blur-xl">
              <div className="mx-auto flex h-14 max-w-none items-center justify-between gap-4 px-4 sm:px-7">
                {/* Logo */}
                <Link
                  href="/"
                  className="group flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-text-primary"
                >
                  {/* Cricket ball icon */}
                  <svg className="h-6 w-6 text-accent-green transition-transform duration-300 group-hover:rotate-[360deg]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M14.5 4.5c-1 2-1 4.5 0 7s1 5 0 7" strokeLinecap="round" />
                    <path d="M9.5 4.5c1 2 1 4.5 0 7s-1 5 0 7" strokeLinecap="round" />
                  </svg>
                  <span>
                    Cric<span className="gradient-text-green">Stats</span>
                  </span>
                </Link>

                {/* Search */}
                <SearchBar />

                {/* Nav links — desktop */}
                <nav className="hidden shrink-0 items-center gap-1 sm:flex">
                  <NavLink href="/">Home</NavLink>
                  <NavLink href="/matches">Matches</NavLink>
                  <NavLink href="/teams">Teams</NavLink>
                  <NavLink href="/compare">Compare</NavLink>
                  <NavLink href="/matchup">Matchup</NavLink>
                  <NavLink href="/player-vs-team">Vs Team</NavLink>
                  <NavLink href="/stat-builder">Stats</NavLink>
                  <div className="ml-2">
                    <ThemeToggle />
                  </div>
                </nav>

                {/* Mobile nav toggle */}
                <MobileNav />
              </div>
            </header>
          }
          footer={
            <footer className="relative border-t border-glass-border py-8 text-center text-sm text-text-muted">
              <div className="mx-auto max-w-6xl px-4">
                <p>
                  Data sourced from{" "}
                  <a
                    href="https://cricsheet.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-green underline decoration-accent-green/30 underline-offset-2 transition hover:decoration-accent-green"
                  >
                    Cricsheet
                  </a>
                </p>
                <p className="mt-2 text-xs text-text-muted/60">
                  Built with Next.js · Ball-by-ball analytics since 2008
                </p>
              </div>
            </footer>
          }
        >
          {children}
        </GlobalLayout>
      </body>
    </html>
  );
}

/* ── Nav link component ───────────────────────────────── */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative rounded-lg px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-200 hover:bg-bg-card/50 hover:text-text-primary"
    >
      {children}
    </Link>
  );
}
