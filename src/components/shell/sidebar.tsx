"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, NAV_SECONDARY } from "./nav";
import { cn } from "@/lib/utils";

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function Sidebar({ householdName }: { householdName: string }) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line bg-surface/60 md:flex xl:w-60">
      <Link href="/today" className="flex h-16 items-center gap-3 px-5">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <span className="hidden truncate font-semibold xl:block">{householdName}</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} title={label} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors", isActive(path, href) ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon className={cn("h-[19px] w-[19px] shrink-0", isActive(path, href) && "text-accent")} />
            <span className="hidden xl:inline">{label}</span>
          </Link>
        ))}
        <div className="my-3 border-t border-line" />
        {NAV_SECONDARY.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} title={label} className={cn("flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium transition-colors", isActive(path, href) ? "bg-surface-3 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon className={cn("h-[19px] w-[19px] shrink-0", isActive(path, href) && "text-accent")} />
            <span className="hidden xl:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <p className="hidden px-5 pb-4 text-[11px] text-faint xl:block">Local-first · data stays on this Mac<br />Version {process.env.NEXT_PUBLIC_HOMEOS_VERSION}</p>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = [NAV[0], NAV[2], NAV[3], NAV[4], NAV[6]];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cn("flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium", isActive(path, href) ? "text-accent" : "text-muted")}>
          <Icon className="h-5 w-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
