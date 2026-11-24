import { SectionTabs } from "@/components/section-tabs";
export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1 className="mb-4 text-[26px] font-semibold tracking-tight">Money</h1>
      <SectionTabs items={[{ href: "/money", label: "Overview", exact: true }, { href: "/money/expenses", label: "Ledger" }, { href: "/money/receipts", label: "Receipts" }, { href: "/money/bills", label: "Bills" }, { href: "/money/budgets", label: "Budgets" }, { href: "/money/prices", label: "Prices" }]} />
      {children}
    </>
  );
}
