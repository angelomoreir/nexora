import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicSection, PublicSectionTitle } from "../../components/layout/public-layout";
import { cn } from "../../lib/utils";

export function FaqPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(0);
  const items = t("public.faq.items", { returnObjects: true }) as { q: string; a: string }[];

  return (
    <PublicSection>
      <PublicSectionTitle eyebrow="FAQ" title={t("public.faq.title")} sub={t("public.faq.sub")} />
      <div className="mx-auto max-w-3xl space-y-3">
        {items.map((item, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface">
            <button onClick={() => setOpen(open === index ? null : index)} aria-expanded={open === index}
              className="nx-focus-ring flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left font-medium hover:bg-surface-hover">
              {item.q}
              <ChevronDown className={cn("size-4 shrink-0 transition-transform", open === index && "rotate-180")} />
            </button>
            {open === index ? <div className="border-t border-border px-5 py-4 text-sm leading-relaxed text-nav-muted">{item.a}</div> : null}
          </div>
        ))}
      </div>
    </PublicSection>
  );
}
