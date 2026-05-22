import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatusCard({ label, status, description }) {
  const isGood = String(status || "").toLowerCase() === "healthy";
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-2 text-lg font-semibold", isGood ? "text-success" : "text-warning")}>{status}</p>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}
