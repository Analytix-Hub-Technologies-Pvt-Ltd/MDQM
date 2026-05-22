import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const toneMap = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export default function KpiMetricCard({ title, value, subtitle, icon: Icon, tone = "default", delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="group overflow-hidden hover:border-primary/30">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
              <p className={cn("mt-2 text-3xl font-semibold tracking-tight", toneMap[tone] || toneMap.default)}>
                {value}
              </p>
              {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
            </div>
            {Icon ? (
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary/20">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
