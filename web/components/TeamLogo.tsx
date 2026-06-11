import React from "react";
import { getTeamIdentity } from "@/lib/teamIdentity";

interface TeamLogoProps {
  teamName: string;
  size?: number;
  className?: string;
  showFallbackText?: boolean;
  loading?: "eager" | "lazy";
}

export function TeamLogo({
  teamName,
  size = 24,
  className = "",
  showFallbackText = true,
  loading = "lazy",
}: TeamLogoProps) {
  const identity = getTeamIdentity(teamName);

  if (identity.logoUrl) {
    return (
      <img
        src={identity.logoUrl}
        alt={`${teamName} logo`}
        width={size}
        height={size}
        className={className}
        loading={loading}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
    );
  }

  // Fallback for missing legacy/non-covered teams
  const fallbackStyles: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    backgroundColor: "var(--bg-card)",
    border: "1px solid var(--glass-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.max(8, size * 0.35),
    fontWeight: 700,
    color: "var(--text-muted)",
    flexShrink: 0,
  };

  return (
    <div className={className} style={fallbackStyles} title={teamName}>
      {showFallbackText ? identity.abbr : ""}
    </div>
  );
}
