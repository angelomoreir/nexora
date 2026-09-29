import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { LanguageSelector } from "../ui/language-selector";
import { ThemeToggle } from "../ui/theme-toggle";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-2">
      <section className="hidden border-r border-border bg-nav p-12 text-nav-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="NEXORA" className="size-10 rounded-md object-cover" />
          <span className="text-lg font-semibold tracking-[0.16em]">NEXORA</span>
        </Link>
        <div className="max-w-lg">
          <ShieldCheck className="mb-6 size-9 text-primary" strokeWidth={1.7} />
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">{t("auth.slogan")}</h2>
          <p className="mt-4 max-w-md text-sm leading-6 text-nav-muted">{t("auth.sloganDesc")}</p>
        </div>
        <p className="text-xs text-nav-muted">NEXORA · {t("auth.enterpriseWorkspace")}</p>
      </section>
      <section className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute right-5 top-5 flex items-center gap-2"><LanguageSelector /><ThemeToggle /></div>
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden">
            <Link to="/" className="flex items-center gap-3 font-semibold tracking-[0.14em]">
              <img src="/logo.png" alt="NEXORA" className="size-9 rounded-md object-cover" />NEXORA
            </Link>
          </div>
          <h1 className="nx-h1">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-secondary-foreground">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
