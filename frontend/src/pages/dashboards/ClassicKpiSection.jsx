import { useState } from "react";
import LegacyKpiDashboard from "../Dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ClassicKpiSection({ defaultOpen = false }) {
  const [show, setShow] = useState(defaultOpen);

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Classic KPI analytics (all jobs)
        </CardTitle>
        <Button variant="outline" size="sm" type="button" onClick={() => setShow((s) => !s)}>
          {show ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {show ? (
        <CardContent className="pt-0">
          <LegacyKpiDashboard embedded />
        </CardContent>
      ) : null}
    </Card>
  );
}
