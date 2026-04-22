interface BadgeProps {
  text: string;
  variant?: "outline" | "filled" | "gold" | "glass";
}

export default function Badge({ text, variant = "outline" }: BadgeProps) {
  const baseStyles =
    "inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full transition-all duration-200 hover:scale-105";

  const variantStyles =
    variant === "outline"
      ? "border border-[--accent-green]/40 text-[--accent-green] bg-[--accent-green]/5 hover:bg-[--accent-green]/10 hover:border-[--accent-green]/60"
      : variant === "gold"
      ? "border border-[--accent-gold]/40 text-[--accent-gold] bg-[--accent-gold]/10 hover:bg-[--accent-gold]/15 shadow-sm shadow-[--accent-gold-glow]"
      : variant === "glass"
      ? "border border-[--glass-border] text-[--text-secondary] bg-[--glass-bg] backdrop-blur-sm"
      : "bg-[--accent-green]/10 text-[--accent-green] hover:bg-[--accent-green]/15";

  return <span className={`${baseStyles} ${variantStyles}`}>{text}</span>;
}
