/**
 * Registers the service worker for PWA support.
 * Only runs in production builds — in dev mode a service worker
 * would cache Vite's dev server output and break HMR.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal — the app works fine without it.
    });
  });
}
