import { AssistantChat } from "@/components/assistant/chat";

export const metadata = { title: "Kitchen assistant" };

export default async function KitchenAssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <p className="mb-4 max-w-2xl text-sm text-muted">The kitchen assistant reads your actual pantry records, recipes and meal plan. It distinguishes confirmed from estimated quantities and never assumes what&apos;s in the fridge. Pantry and plan changes are previewed for approval. It also speaks up on its own: after you add food, it suggests what to make with it, and on the Food page it suggests what to eat next from your targets.</p>
      <AssistantChat surface="KITCHEN" storageKey="homeos.chat.kitchen" initialQuestion={q?.slice(0, 300)} placeholder="e.g. what can I cook with 500g chicken thighs, spinach and mushrooms?" suggestions={[
        "What can I cook today?", "What can I make without going grocery shopping?", "What vegetables are left?", "What is expiring?", "What should I buy?",
        "What can I cook with 500g chicken thighs, spinach and mushrooms?", "We bought 2 kg rice and 12 eggs", "Plan seven days of dinners using our existing pantry inventory, keep grocery spending under $120 and avoid repeating chicken more than twice",
      ]} />
    </>
  );
}
