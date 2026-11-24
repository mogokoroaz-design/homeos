import { Sun, Users, UtensilsCrossed, House, Wallet, FolderKanban, CalendarDays, ChartLine, StickyNote, Sparkles, Settings } from "lucide-react";

export const NAV = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/people", label: "People", icon: Users },
  { href: "/food", label: "Food", icon: UtensilsCrossed },
  { href: "/home", label: "Home", icon: House },
  { href: "/money", label: "Money", icon: Wallet },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/insights", label: "Insights", icon: ChartLine },
  { href: "/notes", label: "Notes", icon: StickyNote },
];
export const NAV_SECONDARY = [
  { href: "/assistant", label: "Assistant", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
