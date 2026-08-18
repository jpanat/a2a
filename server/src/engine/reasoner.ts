// Pluggable "reasoner": produces the natural-language explanation shown next
// to a proposed slot ("why it matches"). The actual scheduling decision
// (which slot is feasible) is always made by deterministic calendar logic in
// withIoc.ts / withoutIoc.ts - the reasoner only narrates it. This keeps the
// demo reproducible while still letting a real LLM call replace the prose.
//
// Toggle with env vars:
//   USE_LLM_REASONING=true   - turns the LLM path on
//   ANTHROPIC_API_KEY=...    - required for the LLM path; falls back to the
//                              rule-based template if missing or if the call fails
//   ANTHROPIC_MODEL=...      - defaults to claude-haiku-4-5-20251001

export type ReasonerMode = "rule-based" | "llm";

export interface ResolutionExplainInput {
  scenarioTitle: string;
  slotDescription: string;
  durationMinutes: number;
  originalDurationMinutes: number;
  reasons: string[]; // e.g. ["both sides free", "trimmed from 60 to 30 minutes to clear a soft-busy hold"]
}

const USE_LLM = process.env.USE_LLM_REASONING === "true";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export function activeReasonerMode(): ReasonerMode {
  return USE_LLM && !!process.env.ANTHROPIC_API_KEY ? "llm" : "rule-based";
}

export async function explainResolution(input: ResolutionExplainInput): Promise<string> {
  if (activeReasonerMode() === "llm") {
    try {
      return await callAnthropic(input);
    } catch (err) {
      console.warn("[reasoner] LLM call failed, falling back to rule-based explanation:", (err as Error).message);
      return templateExplanation(input);
    }
  }
  return templateExplanation(input);
}

function templateExplanation(input: ResolutionExplainInput): string {
  const trimmed = input.durationMinutes < input.originalDurationMinutes;
  const parts = [`This slot works for both calendars (${input.reasons.join("; ")}).`];
  if (trimmed) {
    parts.push(
      `The joint negotiation trimmed the meeting from ${input.originalDurationMinutes} to ${input.durationMinutes} minutes so it fits cleanly for both sides.`
    );
  }
  return parts.join(" ");
}

async function callAnthropic(input: ResolutionExplainInput): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            `A scheduling negotiation between two AI agents just resolved for "${input.scenarioTitle}". ` +
            `Proposed slot: ${input.slotDescription} (${input.durationMinutes} minutes, originally requested as ${input.originalDurationMinutes} minutes). ` +
            `Reasoning inputs: ${input.reasons.join("; ")}. ` +
            `Write a 1-2 sentence, friendly, concrete explanation of why this slot was chosen, suitable for an inline suggestion card in an email client.`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  const json = (await res.json()) as { content?: Array<{ text?: string }> };
  const text = json.content?.map((c) => c.text || "").join("").trim();
  if (!text) throw new Error("Empty LLM response");
  return text;
}
