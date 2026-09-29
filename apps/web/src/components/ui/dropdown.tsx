import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

export function Dropdown({ trigger, children, align = "end", className }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const dismiss = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);

  function toggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const estimatedMenuHeight = 320;
      const openUp = rect.bottom + 6 + estimatedMenuHeight > window.innerHeight && rect.top - 6 > estimatedMenuHeight;
      const style: CSSProperties = { position: "fixed", minWidth: "12rem" };
      if (align === "end") style.right = Math.max(8, window.innerWidth - rect.right);
      else style.left = Math.max(8, rect.left);
      if (openUp) {
        style.bottom = window.innerHeight - rect.top + 6;
        style.maxHeight = Math.max(160, rect.top - 14);
      } else {
        style.top = rect.bottom + 6;
        style.maxHeight = Math.max(160, window.innerHeight - rect.bottom - 14);
      }
      setPosition(style);
    }
    setOpen((value) => !value);
  }

  const menu = open ? (
    <div
      ref={menuRef}
      role="menu"
      style={position}
      className={cn("z-[60] overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-[var(--nx-shadow-overlay)]", className)}
      onClick={() => setOpen(false)}
    >
      {children}
    </div>
  ) : null;

  return <div ref={ref} className="relative inline-flex"><span onClick={toggle}>{trigger}</span>{menu ? createPortal(menu, document.body) : null}</div>;
}

export function DropdownItem({ children, destructive, disabled, onClick, className }: { children: ReactNode; destructive?: boolean; disabled?: boolean; onClick?: () => void; className?: string }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={cn("nx-focus-ring flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-secondary-foreground hover:bg-surface-secondary hover:text-foreground disabled:opacity-[var(--nx-disabled-opacity)]", destructive && "text-danger hover:bg-danger-subtle hover:text-danger", className)}>{children}</button>;
}

export function DropdownSeparator() { return <div role="separator" className="my-1 h-px bg-border" />; }
