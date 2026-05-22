import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary dark:bg-primary/20",
        secondary: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-600/40 dark:bg-cyan-950/50 dark:text-cyan-200",
        success:
          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-600/40 dark:bg-emerald-950/50 dark:text-emerald-200",
        warning:
          "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-600/40 dark:bg-amber-950/50 dark:text-amber-200",
        destructive:
          "border-red-300 bg-red-50 text-red-800 dark:border-red-600/40 dark:bg-red-950/50 dark:text-red-200",
        outline: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
