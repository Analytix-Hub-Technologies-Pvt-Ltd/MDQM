import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Input = forwardRef(({ className, type = "text", ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors",
      "border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-foreground)]",
      "placeholder:font-normal placeholder:text-[var(--placeholder)]",
      "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
