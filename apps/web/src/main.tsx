import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Providers } from "./app/providers";
import { router } from "./app/router";
import { ErrorBoundary } from "./components/error-boundary";
import { registerServiceWorker } from "./lib/pwa";
import "./i18n";
import "./index.css";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <Suspense fallback={<div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">…</div>}>
          <RouterProvider router={router} />
        </Suspense>
      </Providers>
    </ErrorBoundary>
  </StrictMode>
);
