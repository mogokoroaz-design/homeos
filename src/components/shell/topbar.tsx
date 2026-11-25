"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Lock, Plus, StickyNote, Sparkles, Menu, Check, UserRound, ChevronDown } from "lucide-react";
import { buttonClass } from "../ui";
import { lockAction, switchProfileAction } from "@/app/(auth)/actions";
import { NotesPanel } from "./notes-panel";
import { QuickAdd } from "./quick-add";
import { NAV, NAV_SECONDARY } from "./nav";
import { cn } from "@/lib/utils";

export function TopBar({ viewer, profiles }: { viewer: { name: string; color: string; profileId: string }; profiles: { id: string; name: string; color: string; hasPin: boolean }[] }) {
  const [notes, setNotes] = useState(false);
  const [quick, setQuick] = useState(false);
  const [menu, setMenu] = useState(false);
  const path = usePathname();
  const section = [...NAV, ...NAV_SECONDARY].find((n) => path === n.href || path.startsWith(n.href + "/"));
  return (
    <>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button type="button" className={cn(buttonClass("ghost", "icon"), "md:hidden")} onClick={() => setMenu(!menu)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-muted">{section?.label ?? "HomeOS"}</p>
        <button type="button" onClick={() => setQuick(true)} className={buttonClass("primary", "md")} aria-label="Quick add"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add</span></button>
        <button type="button" onClick={() => setNotes(true)} className={buttonClass("ghost", "icon")} aria-label="Open notes" title="Notes"><StickyNote className="h-[19px] w-[19px]" /></button>
        <Link href="/assistant" className={buttonClass("ghost", "icon")} aria-label="Assistant" title="Assistant"><Sparkles className="h-[19px] w-[19px]" /></Link>
        <ProfileMenu viewer={viewer} profiles={profiles} />
      </header>
      {menu ? (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMenu(false)}>
          <nav className="h-full w-64 border-r border-line bg-surface p-3" onClick={(e) => e.stopPropagation()}>
            {[...NAV, ...NAV_SECONDARY].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setMenu(false)} className="flex h-12 items-center gap-3 rounded-xl px-3 text-muted hover:bg-surface-2 hover:text-ink"><Icon className="h-5 w-5" />{label}</Link>
            ))}
          </nav>
        </div>
      ) : null}
      <NotesPanel open={notes} onClose={() => setNotes(false)} />
      <QuickAdd open={quick} onClose={() => setQuick(false)} profiles={profiles} viewerId={viewer.profileId} />
    </>
  );
}

/** Tap your name to switch between household members or open your profile. */
function ProfileMenu({ viewer, profiles }: { viewer: { name: string; color: string; profileId: string }; profiles: { id: string; name: string; color: string; hasPin: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const me = profiles.find((p) => p.id === viewer.profileId);
  return (
    <div className="relative ml-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={`Profile: ${viewer.name}. Switch profile`} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2 py-1.5 hover:bg-surface-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-[#0c1110]" style={{ background: viewer.color }}>{viewer.name[0]?.toUpperCase()}</span>
        <span className="hidden text-sm font-medium sm:inline">{viewer.name}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="fade-in absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl">
            <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-faint">Who&apos;s using HomeOS?</p>
            {profiles.map((p) => (
              <form key={p.id} action={switchProfileAction}>
                <input type="hidden" name="profileId" value={p.id} />
                <button type="submit" role="menuitem" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[#0c1110]" style={{ background: p.color }}>{p.name[0]?.toUpperCase()}</span>
                  <span className="flex-1 font-medium">{p.name}</span>
                  {p.id === viewer.profileId ? <Check className="h-4 w-4 text-accent" /> : p.hasPin ? <Lock className="h-3.5 w-3.5 text-faint" aria-label="PIN required" /> : null}
                </button>
              </form>
            ))}
            <div className="border-t border-line">
              <Link href="/people" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:bg-surface-2 hover:text-ink"><UserRound className="h-4 w-4" />My profile{me && !me.hasPin ? <span className="ml-auto text-xs text-warn">set a PIN</span> : null}</Link>
              {me?.hasPin ? (
                <form action={lockAction}><button type="submit" role="menuitem" className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-ink"><Lock className="h-4 w-4" />Lock</button></form>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
