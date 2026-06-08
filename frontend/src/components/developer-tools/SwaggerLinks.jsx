import { ExternalLink, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OPENAPI_JSON_URL, SWAGGER_DOCS_URL } from "@/utils/apiDocsUrl";

export default function SwaggerLinks({ size = "sm", className }) {
  return (
    <div className={className}>
      <Button variant="outline" size={size} asChild>
        <a href={SWAGGER_DOCS_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
          Open Swagger Docs
        </a>
      </Button>
      <Button variant="outline" size={size} asChild>
        <a href={OPENAPI_JSON_URL} target="_blank" rel="noopener noreferrer">
          <FileJson className="h-4 w-4" />
          Open OpenAPI JSON
        </a>
      </Button>
    </div>
  );
}
