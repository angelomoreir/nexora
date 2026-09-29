import "@testing-library/jest-dom/vitest";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ptPT } from "../src/i18n/locales/pt-PT";

await i18n.use(initReactI18next).init({
  resources: { "pt-PT": { translation: ptPT } },
  lng: "pt-PT",
  fallbackLng: "pt-PT",
  interpolation: { escapeValue: false }
});

// happy-dom does not implement scrollIntoView
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
