import type { ImgHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-11 text-sm" };

export function Avatar({ name, src, size = "md", className, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { name: string; src?: string | null; size?: keyof typeof sizes }) {
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  if (src) return <img src={src} alt={props.alt ?? name} className={cn("rounded-full object-cover", sizes[size], className)} {...props} />;
  return <span role="img" aria-label={name} className={cn("grid shrink-0 place-items-center rounded-full bg-primary-subtle font-semibold text-primary-subtle-foreground", sizes[size], className)}>{initials}</span>;
}
