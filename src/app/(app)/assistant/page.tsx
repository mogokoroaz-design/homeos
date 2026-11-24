import { PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/assistant/chat";
import { getAIConfig } from "@/lib/ai/provider";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ai = await getAIConfig();
  return (
    <>
      <PageHeader title="Household assistant" sub={`Works across food, home, money, calendar and projects. Engine: ${ai.provider === "ollama" ? `rules + local AI (${ai.ollamaModel})` : "rule-based (no AI service needed)"}.`} />
      <AssistantChat surface="HOUSEHOLD" storageKey="homeos.chat.household" initialQuestion={q} placeholder="Ask anything about the household…" suggestions={[
        "What's happening this week?", "Which bills are due?", "Are we spending more on groceries this month?", "Which store has the lowest price for milk?",
        "Which products have increased in price?", "How much could we save by switching brands?", "What should I buy?", "Create a daily reading tracker",
      ]} />
    </>
  );
}
