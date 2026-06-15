import { useState } from "react";
import { Code2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useDatabaseStatus } from "@/hooks/useDatabaseStatus";
import DeveloperToolsOverviewTab from "@/components/developer-tools/DeveloperToolsOverviewTab";
import SystemHealthTab from "@/components/developer-tools/SystemHealthTab";
import DatabaseStatusTab from "@/components/developer-tools/DatabaseStatusTab";
import DeveloperUtilitiesTab from "@/components/developer-tools/DeveloperUtilitiesTab";
import SwaggerLinks from "@/components/developer-tools/SwaggerLinks";

const TABS = [
  { id: "overview", label: "API Docs" },
  { id: "health", label: "System Health" },
  { id: "database", label: "Database Status" },
  { id: "utilities", label: "Developer Utilities" },
];

export default function DeveloperToolsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const { health, loading: healthLoading, error: healthError, refresh: refreshHealth } = useSystemHealth();
  const { status: dbStatus, loading: dbLoading, error: dbError, refresh: refreshDb } = useDatabaseStatus();
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-card to-accent/10 p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Code2 className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Developer Tools</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Centralized workspace for developers, administrators, and support engineers to inspect APIs,
                monitor platform health, and access developer utilities.
              </p>
            </div>
          </div>
          <SwaggerLinks className="flex shrink-0 flex-wrap gap-2" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs sm:text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <DeveloperToolsOverviewTab />
        </TabsContent>

        <TabsContent value="health">
          <SystemHealthTab
            health={health}
            loading={healthLoading}
            error={healthError}
            onRefresh={refreshHealth}
          />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseStatusTab
            status={dbStatus}
            loading={dbLoading}
            error={dbError}
            onRefresh={refreshDb}
          />
        </TabsContent>

        <TabsContent value="utilities">
          <DeveloperUtilitiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
