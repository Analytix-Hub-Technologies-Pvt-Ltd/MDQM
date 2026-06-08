import { useState } from "react";
import { Copy, Eraser, Link2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE_URL } from "@/config/apiConfig";
import { OPENAPI_JSON_URL, REDOC_URL, SWAGGER_DOCS_URL } from "@/utils/apiDocsUrl";
import SwaggerLinks from "./SwaggerLinks";
import FutureCapabilitiesGrid from "./FutureCapabilitiesGrid";

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{value}</code>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="shrink-0">
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export default function DeveloperUtilitiesTab() {
  const apiBase = API_BASE_URL || `${window.location.origin} (proxied)`;

  const clearLocalAuth = () => {
    localStorage.removeItem("mdqm_token");
    localStorage.removeItem("mdqm_user");
    window.location.hash = "#/login";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            API documentation
          </CardTitle>
          <CardDescription>Quick links to interactive docs and schema exports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SwaggerLinks className="flex flex-wrap gap-2" />
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label="Swagger UI" value={SWAGGER_DOCS_URL} />
            <CopyField label="OpenAPI JSON" value={OPENAPI_JSON_URL} />
            <CopyField label="ReDoc" value={REDOC_URL} />
            <CopyField label="API base URL" value={apiBase} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-primary" />
            Local developer actions
          </CardTitle>
          <CardDescription>Utilities for debugging auth and environment issues.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={clearLocalAuth}>
            <Eraser className="h-4 w-4" />
            Clear local auth & re-login
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={SWAGGER_DOCS_URL} target="_blank" rel="noopener noreferrer">
              Test APIs in Swagger
            </a>
          </Button>
        </CardContent>
      </Card>

      <FutureCapabilitiesGrid />
    </div>
  );
}
