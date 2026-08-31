"use client";

import { useEffect, useState } from "react";

/**
 * Global cricket-themed loading screen — "The Delivery".
 *
 * Masks Render free-tier cold-start latency with a full cricket scene:
 * pitch strip, stumps with bails, a bouncing/spinning cricket ball,
 * stadium floodlight ambience, and rotating cricket messages.
 *
 * - `serverAwake` is module-scoped so it survives client-side navigation.
 * - Health check is non-blocking; the app renders behind the overlay.
 * - Light and dark themes are fully supported via CSS custom properties.
 */

// Module-scoped — survives client-side navigation (component remounts).
let serverAwake = false;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const HEALTH_URL = `${API_BASE}/api/v1/health`;
const POLL_MS = 4_000;
const SLOW_MS = 5_000;
const ROTATE_MS = 3_500;

const MESSAGES = [
  "Setting the field…",
  "Rolling the pitch…",
  "The bowler marks their run-up…",
  "Floodlights warming up…",
  "Checking the pitch report…",
];

const SLOW_MESSAGES = [
  "Server's on a tea break — almost back! ☕",
  "The third umpire is reviewing… hang tight!",
  "Free-tier waking up (~40 s). Great innings need patience!",
  "Buffering like a DRS review… the verdict's coming!",
  "Server doing warm-up stretches — nearly match-ready!",
];

export default function StartupLoader() {
  const [visible, setVisible] = useState(() => !serverAwake);
  const [fadingOut, setFadingOut] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);
  const [msgVisible, setMsgVisible] = useState(true);

  /* ── Health polling ─────────────────────────────── */
  useEffect(() => {
    if (serverAwake) return;

    let cancelled = false;
    const ac = new AbortController();

    const wake = () => {
      if (cancelled) return;
      serverAwake = true;
      setFadingOut(true);
      setTimeout(() => setVisible(false), 750);
    };

    const ping = async () => {
      try {
        const r = await fetch(HEALTH_URL, { signal: ac.signal, cache: "no-store" });
        if (r.ok) wake();
      } catch {
        /* network error / timeout — keep polling */
      }
    };

    ping();
    const slow = setTimeout(() => {
      if (!serverAwake) setIsSlow(true);
    }, SLOW_MS);
    const poll = setInterval(() => {
      if (!serverAwake) ping();
    }, POLL_MS);

    return () => {
      cancelled = true;
      ac.abort();
      clearTimeout(slow);
      clearInterval(poll);
    };
  }, []);

  /* ── Message rotation ───────────────────────────── */
  useEffect(() => {
    if (serverAwake) return;
    const pool = isSlow ? SLOW_MESSAGES : MESSAGES;

    const id = setInterval(() => {
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIdx((prev) => (prev + 1) % pool.length);
        setMsgVisible(true);
      }, 350);
    }, ROTATE_MS);

    return () => clearInterval(id);
  }, [isSlow]);

  // Reset index when switching to slow pool.
  useEffect(() => {
    if (isSlow) {
      setMsgIdx(0);
      setMsgVisible(true);
    }
  }, [isSlow]);

  if (!visible) return null;

  const pool = isSlow ? SLOW_MESSAGES : MESSAGES;

  return (
    <div
      className={`startup-loader${fadingOut ? " is-hidden" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Loading cricket statistics"
    >
      {/* Stadium floodlight ambience */}
      <div className="loader-floodlight" aria-hidden="true" />

      {/* ── Cricket scene ── */}
      <div className="loader-scene" aria-hidden="true">
        {/* Pitch strip with crease lines */}
        <div className="loader-pitch">
          <div className="loader-crease loader-crease--top" />
          <div className="loader-crease loader-crease--bot" />
        </div>

        {/* Stumps + bails */}
        <div className="loader-stumps">
          <div className="loader-stump" />
          <div className="loader-stump" />
          <div className="loader-stump" />
          <div className="loader-bail loader-bail--l" />
          <div className="loader-bail loader-bail--r" />
          <div className="loader-stump-glow" />
        </div>

        {/* Cricket ball */}
        <div className="loader-ball-track">
          <div className="loader-ball" />
          <div className="loader-ball-shadow" />
        </div>
      </div>

      {/* Brand */}
      <div className="loader-brand">
        Cric<span className="gradient-text-green">Stats</span>
      </div>

      {/* Rotating message */}
      <p className={`loader-message${msgVisible ? " is-visible" : ""}`}>
        {pool[msgIdx % pool.length]}
      </p>
    </div>
  );
}
