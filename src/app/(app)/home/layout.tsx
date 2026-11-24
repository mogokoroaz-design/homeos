import { SectionTabs } from "@/components/section-tabs";
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight">Home</h1>
      <SectionTabs items={[{ href: "/home", label: "Tasks & cleaning", exact: true }, { href: "/home/services", label: "Services & visits" }, { href: "/home/maintenance", label: "Maintenance" }]} />
      {children}
    </>
  );
}
