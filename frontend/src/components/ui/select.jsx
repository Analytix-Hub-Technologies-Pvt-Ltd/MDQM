import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const Select = forwardRef(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors",
      "border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--input-foreground)]",
      "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export { Select };
