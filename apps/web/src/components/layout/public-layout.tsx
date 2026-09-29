import { useQuery } from "@tanstack/react-query";
import { Menu, X } from "lucide-react";
import { Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { authApi } from "../../lib/api";
import { Button } from "../ui";
import { LanguageSelector } from "../ui/language-selector";

export function PublicLayout() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const session = useQuery({ queryKey: ["session"], queryFn: authApi.me, retry: false });
  const loggedIn = Boolean(session.data?.user);

  const links = [
    { to: "/features", label: t("public.nav.features") },
    { to: "/pricing", label: t("public.nav.pricing") },
    { to: "/about", label: t("public.nav.about") },
    { to: "/faq", label: "FAQ" },
    { to: "/contact", label: t("public.nav.contact") }
  ];

  return (
    <div className="dark min-h-screen bg-nav text-nav-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-nav-border bg-nav/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="NEXORA" className="size-8 rounded-md object-cover" />
            <span className="text-sm font-semibold tracking-[0.16em]">NEXORA</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link key={link.to} to={link.to} className="nx-focus-ring rounded-md px-3 py-2 text-sm text-nav-muted transition-colors hover:bg-nav-hover hover:text-nav-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <LanguageSelector />
            {loggedIn ? (
              <Link to="/dashboard"><Button size="sm">{t("public.nav.openApp")}</Button></Link>
            ) : (
              <>
                <Link to="/login"><Button size="sm" variant="ghost" className="text-nav-muted hover:text-nav-foreground">{t("public.nav.login")}</Button></Link>
                <Link to="/register"><Button size="sm">{t("public.nav.register")}</Button></Link>
              </>
            )}
          </div>
          <button className="nx-focus-ring p-2 md:hidden" onClick={() => setOpen(!open)} aria-label={t("common.menu")} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open ? (
          <nav className="space-y-1 border-t border-nav-border bg-nav px-4 py-3 md:hidden">
            {links.map((link) => (
              <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-nav-muted hover:bg-nav-hover">{link.label}</Link>
            ))}
            <Link to={loggedIn ? "/dashboard" : "/login"} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm font-medium text-primary">
              {loggedIn ? t("public.nav.openApp") : t("public.nav.login")}
            </Link>
          </nav>
        ) : null}
      </header>
      <main className="pt-16"><Suspense fallback={<div className="grid min-h-[60vh] place-items-center text-sm text-nav-muted">…</div>}><Outlet /></Suspense></main>
      <footer className="border-t border-nav-border py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 md:flex-row">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="NEXORA" className="size-7 rounded-md object-cover" />
            <span className="text-sm font-semibold tracking-[0.16em]">NEXORA</span>
          </Link>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-nav-muted">
            {links.map((link) => <Link key={link.to} to={link.to} className="hover:text-nav-foreground">{link.label}</Link>)}
            <Link to="/terms" className="hover:text-nav-foreground">{t("legal.terms.short")}</Link>
            <Link to="/privacy" className="hover:text-nav-foreground">{t("legal.privacy.short")}</Link>
          </div>
          <p className="text-xs text-nav-muted">© 2026 NEXORA · {t("public.footerTag")}</p>
        </div>
      </footer>
    </div>
  );
}

export function PublicSection({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-6xl px-4 py-16 md:py-24 ${className}`}>{children}</section>;
}

export function PublicSectionTitle({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      {eyebrow ? <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary-subtle-foreground">{eyebrow}</p> : null}
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      {sub ? <p className="mt-4 text-nav-muted">{sub}</p> : null}
    </div>
  );
}
