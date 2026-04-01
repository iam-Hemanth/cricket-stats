interface BadgeProps {
  text: string;
  variant?: "outline" | "filled" | "gold";
}

export default function Badge({ text, variant = "outline" }: BadgeProps) {
  const baseStyles = "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full";

  const variantStyles =
    variant === "outline"
      ? "border border-[--accent-green] text-[--accent-green] bg-transparent"
      : variant === "gold"
      ? "border border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b]/10"
      : "bg-[--accent-green]/10 text-[--accent-green]";

  return <span className={`${baseStyles} ${variantStyles}`}>{text}</span>;
}
