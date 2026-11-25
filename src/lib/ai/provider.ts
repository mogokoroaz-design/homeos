// Provider-independent AI layer.
//  1. Local AI via Ollama (free, runs on the Mac) when the user enables it.
//  2. Deterministic rule-based engine otherwise — every essential feature works without AI.
// No external/paid provider is contacted. Personal data never leaves the machine by default.
import { getSetting } from "../settings";

export interface CompletionRequest {
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  images?: string[]; // base64 (no data: prefix) — only for vision models
}

export interface AIProvider {
  id: string;
  label: string;
  isAvailable(): Promise<boolean>;
  complete(req: CompletionRequest): Promise<string>;
}

export function isLocalUrl(url: string) {
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(u.hostname) || u.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

export class OllamaProvider implements AIProvider {
  id = "ollama";
  constructor(private baseUrl: string, private model: string) {}
  get label() { return `Ollama · ${this.model}`; }
  async isAvailable() {
    if (!isLocalUrl(this.baseUrl)) return false; // privacy guard: only local/LAN Ollama
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      return Boolean(data.models?.some((m) => m.name === this.model || m.name.split(":")[0] === this.model.split(":")[0]));
    } catch {
      return false;
    }
  }
  async complete(req: CompletionRequest) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(req.timeoutMs ?? 60_000),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: req.json ? "json" : undefined,
        options: { temperature: 0.2, num_predict: req.maxTokens ?? 600 },
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.prompt, ...(req.images?.length ? { images: req.images } : {}) }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? "";
  }
}

export async function getAIConfig() {
  return {
    provider: await getSetting("ai.provider", "rules"), // "rules" | "ollama"
    ollamaUrl: await getSetting("ai.ollamaUrl", "http://127.0.0.1:11434"),
    ollamaModel: await getSetting("ai.ollamaModel", "llama3.2:3b"),
    visionModel: await getSetting("ai.visionModel", "qwen2.5vl:3b"),
  };
}

/** A local vision-capable model (for food photos), if local AI is on and the model is installed. */
export async function getVisionModel(): Promise<AIProvider | null> {
  const cfg = await getAIConfig();
  if (cfg.provider !== "ollama" || !cfg.visionModel) return null;
  const p = new OllamaProvider(cfg.ollamaUrl, cfg.visionModel);
  return (await p.isAvailable()) ? p : null;
}

/** Returns the local model if configured and reachable, else null (rules only). */
export async function getLocalModel(): Promise<AIProvider | null> {
  const cfg = await getAIConfig();
  if (cfg.provider !== "ollama") return null;
  const p = new OllamaProvider(cfg.ollamaUrl, cfg.ollamaModel);
  return (await p.isAvailable()) ? p : null;
}

/** Extracts the first JSON object from model output. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in model output");
  return JSON.parse(text.slice(start, end + 1));
}
