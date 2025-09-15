import { loadConfig } from "../config.js";
import { providerFetch } from "./copilot.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

/**
 * Async generator for streaming chat completions
 */
export async function* chatStreamGenerator(
  messages: ChatMessage[],
  opts: {
    model?: string;
    temperature?: number;
    initiator?: "user" | "agent";
  } = {},
): AsyncGenerator<string, void, unknown> {
  if (process.env.NODE_ENV === "test") {
    // Mock streaming for tests
    const testResponse = "test streaming response";
    for (let i = 0; i < testResponse.length; i += 5) {
      const chunk = testResponse.slice(i, i + 5);
      yield chunk;
      // Add small delay to simulate real streaming
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return;
  }

  const cfg = await loadConfig();
  const base = cfg.provider!.copilot!.base_url!;
  const path = cfg.provider!.copilot!.chat_path!;
  const url = new URL(path, base).toString();
  const model = opts?.model || cfg.model?.active || "gpt-4o";
  const payloadMsgs = messages.map((m) =>
    m.role === "tool" ? { role: "assistant", content: m.content } : m,
  );
  const body = {
    model,
    messages: payloadMsgs,
    temperature: opts?.temperature ?? 0.2,
    stream: true,
  } as any;

  const r = await providerFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Initiator": opts?.initiator || "user",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    throw new Error(`chat stream failed: ${r.status} ${txt}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE: lines starting with "data: ", JSON chunks, terminated by [DONE]
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;

        try {
          const jsonStr = trimmed.slice(6); // Remove "data: " prefix
          const chunk = JSON.parse(jsonStr);
          const content = chunk?.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            yield content;
          }
        } catch (parseError) {
          // Ignore parse errors for malformed chunks
          console.debug("Failed to parse streaming chunk:", parseError);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
