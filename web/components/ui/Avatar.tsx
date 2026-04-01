"use client";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

const COLORS = [
  "bg-green-600",
  "bg-blue-600",
  "bg-purple-600",
  "bg-orange-600",
  "bg-pink-600",
  "bg-cyan-600",
] as const;

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({ name, size = "md" }: AvatarProps) {
  const colorClass = COLORS[hashName(name) % COLORS.length];
  const initials = getInitials(name);
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={`${colorClass} ${sizeClass} inline-flex items-center justify-center rounded-full font-semibold text-white`}
    >
      {initials}
    </div>
  );
}
