import { AssistantChat } from "@/components/assistant/chat";

export const metadata = { title: "Kitchen assistant" };

export default function KitchenAssistantPage() {
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted">The kitchen assistant reads your actual pantry records, recipes and meal plan. It distinguishes confirmed from estimated quantities and never assumes what&apos;s in the fridge. Pantry and plan changes are previewed for approval.</p>
      <AssistantChat surface="KITCHEN" storageKey="homeos.chat.kitchen" placeholder="e.g. what can I cook with 500g chicken thighs, spinach and mushrooms?" suggestions={[
        "What can I cook today?", "What can I make without going grocery shopping?", "What vegetables are left?", "What is expiring?", "What should I buy?",
        "What can I cook with 500g chicken thighs, spinach and mushrooms?", "We bought 2 kg rice and 12 eggs", "Plan seven days of dinners using our existing pantry inventory, keep grocery spending under $120 and avoid repeating chicken more than twice",
      ]} />
    </>
  );
}
