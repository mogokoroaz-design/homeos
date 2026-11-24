import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

const BTN = {
  base: "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap",
  variant: {
    primary: "bg-accent text-[#0c1110] hover:bg-[#b0d3c2]",
    secondary: "bg-surface-3 text-ink border border-line-strong hover:bg-[#252a31]",
    ghost: "text-muted hover:text-ink hover:bg-surface-3",
    danger: "bg-danger-dim text-danger border border-[#5a3330] hover:bg-[#4a2d2a]",
    outline: "border border-line-strong text-ink hover:bg-surface-3",
  },
  size: { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-12 px-5 text-base", icon: "h-11 w-11", iconSm: "h-9 w-9" },
};
export type ButtonVariant = keyof typeof BTN.variant;
export type ButtonSize = keyof typeof BTN.size;
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cn(BTN.base, BTN.variant[variant], BTN.size[size], className);
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

const FIELD = "w-full rounded-xl border border-line-strong bg-surface-2 px-3.5 text-ink placeholder:text-faint outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/20 transition";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(FIELD, "h-11", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD, "py-2.5 min-h-24", className)} {...props} />;
}
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(FIELD, "h-11 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239098a5%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_12px_center] bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-[13px] font-medium text-muted mb-1.5", className)} {...props} />;
}

/** Labelled control. The label wraps the control so it is programmatically associated;
 * use `group` for composite controls (button groups, checklists) to avoid nesting labels. */
export function Field({ label, hint, children, className, group }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; group?: boolean }) {
  const inner = (
    <>
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </>
  );
  return group ? <div role="group" aria-label={label} className={className}>{inner}</div> : <label className={cn("block", className)}>{inner}</label>;
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2.5 text-sm text-ink cursor-pointer select-none min-h-9", className)}>
      <input type="checkbox" className="h-5 w-5 rounded-md accent-[#9cc2b0]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius-card)] border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, action, sub, icon, className }: { title: ReactNode; action?: ReactNode; sub?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">{icon}{title}</h3>
        {sub ? <p className="mt-0.5 text-[13px] text-muted">{sub}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

const TONES = {
  neutral: "bg-surface-3 text-muted border-line-strong",
  accent: "bg-accent-dim text-accent border-[#38503f]",
  warn: "bg-warn-dim text-warn border-[#4d4128]",
  danger: "bg-danger-dim text-danger border-[#55302d]",
  info: "bg-info-dim text-info border-[#2f3a4f]",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-medium leading-none whitespace-nowrap", TONES[tone], className)} {...props} />;
}

export function PageHeader({ title, sub, actions, children }: { title: string; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
          {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mt-5 -mb-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={cn("relative shrink-0 rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors", t.key === active ? "text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent" : "text-muted hover:text-ink")}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-faint">{icon}</div> : null}
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "danger" | "accent" }) {
  return (
    <div className="min-w-0">
      <p className="text-[12.5px] font-medium text-muted">{label}</p>
      <p className={cn("mt-0.5 text-[22px] font-semibold tabular tracking-tight", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-ink")}>{value}</p>
      {sub ? <p className="text-xs text-faint">{sub}</p> : null}
    </div>
  );
}

export function Progress({ value, max, tone = "accent", className }: { value: number; max: number; tone?: "accent" | "warn" | "danger"; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full", tone === "accent" ? "bg-accent" : tone === "warn" ? "bg-warn" : "bg-danger")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Row({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0", className)} {...props} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between first:mt-0">
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">{children}</h2>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-3 px-1.5 font-mono text-[11px] text-muted">{children}</kbd>;
}
