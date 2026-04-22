"use client";

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const GRADIENTS = [
  "from-emerald-500 to-cyan-500",
  "from-blue-500 to-purple-500",
  "from-purple-500 to-pink-500",
  "from-orange-500 to-rose-500",
  "from-teal-500 to-blue-500",
  "from-indigo-500 to-violet-500",
  "from-green-500 to-emerald-500",
  "from-cyan-500 to-blue-500",
] as const;

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
} as const;

const RING_SIZES = {
  sm: "p-[1.5px]",
  md: "p-[2px]",
  lg: "p-[2.5px]",
  xl: "p-[3px]",
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
  const gradientClass = GRADIENTS[hashName(name) % GRADIENTS.length];
  const initials = getInitials(name);
  const sizeClass = SIZE_CLASSES[size];
  const ringSize = RING_SIZES[size];

  return (
    <div
      className={`${ringSize} inline-flex shrink-0 rounded-full bg-gradient-to-br ${gradientClass} transition-shadow duration-300 hover:shadow-lg hover:shadow-current/20`}
    >
      <div
        className={`${sizeClass} inline-flex items-center justify-center rounded-full bg-[--bg-card] font-semibold text-[--text-primary] transition-colors`}
      >
        {initials}
      </div>
    </div>
  );
}
