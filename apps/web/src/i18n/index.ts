import i18n, { type BackendModule, type ResourceKey } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGUAGES = [
  { code: "pt-PT", label: "Português", flag: "🇵🇹", short: "PT" },
  { code: "en", label: "English", flag: "🇬🇧", short: "EN" },
  { code: "fr", label: "Français", flag: "🇫🇷", short: "FR" },
  { code: "es", label: "Español", flag: "🇪🇸", short: "ES" },
  { code: "de", label: "Deutsch", flag: "🇩🇪", short: "DE" }
] as const;

export const DEFAULT_LANGUAGE = "pt-PT";
export const LANGUAGE_STORAGE_KEY = "nexora-language";

// Locale bundles are loaded on demand so the main chunk does not ship all
// five translation files (~700KB) eagerly.
const loaders: Record<string, () => Promise<ResourceKey>> = {
  "pt-PT": () => import("./locales/pt-PT").then((m) => m.ptPT),
  en: () => import("./locales/en").then((m) => m.en),
  fr: () => import("./locales/fr").then((m) => m.fr),
  es: () => import("./locales/es").then((m) => m.es),
  de: () => import("./locales/de").then((m) => m.de)
};

const lazyBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    const loader = loaders[language];
    if (!loader) {
      callback(new Error(`Unsupported language: ${language}`), null);
      return;
    }
    loader().then((resources) => callback(null, resources)).catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null));
  }
};

void i18n
  .use(lazyBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"]
    }
  });

export default i18n;
