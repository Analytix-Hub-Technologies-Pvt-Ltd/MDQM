import { useMemo } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { Card, CardContent } from "@/components/ui/card";
import { OPENAPI_JSON_URL } from "@/utils/apiDocsUrl";

function getAuthToken() {
  return localStorage.getItem("mdqm_token");
}

export default function EmbeddedSwaggerUI() {
  const requestInterceptor = useMemo(
    () => (request) => {
      const token = getAuthToken();
      if (token) {
        request.headers.Authorization = `Bearer ${token}`;
      }
      return request;
    },
    [],
  );

  return (
    <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="embedded-swagger min-h-[70vh]">
            <SwaggerUI
              url={OPENAPI_JSON_URL}
              docExpansion="list"
              defaultModelsExpandDepth={-1}
              persistAuthorization
              tryItOutEnabled
              requestInterceptor={requestInterceptor}
            />
          </div>
        </CardContent>
    </Card>
  );
}
