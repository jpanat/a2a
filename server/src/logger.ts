// Prints the agent-to-agent transcript to the server's own console, so you
// can watch a negotiation happen in the terminal running `npm run dev`
// instead of only reading it in the browser. Purely a side effect for
// observability - the engine itself stays pure and doesn't call this.
import { NegotiationSession, TranscriptMessage } from "./types/domain";

const ENABLED = process.env.LOG_TRANSCRIPTS !== "false";
const NO_COLOR = !!process.env.NO_COLOR;

const CODES = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
} as const;

function c(code: keyof typeof CODES, text: string): string {
  return NO_COLOR ? text : `${CODES[code]}${text}${CODES.reset}`;
}

function stageColor(m: TranscriptMessage): keyof typeof CODES {
  if (m.kind === "escalation") return "red";
  if (m.kind === "resolution") return "green";
  if (m.kind === "mapping" || m.kind === "intent") return "magenta";
  return "cyan";
}

const RULE = "-".repeat(78);

/** Full, human-readable dump of one negotiation's transcript - one block per run. */
export function logTranscript(session: NegotiationSession): void {
  if (!ENABLED) return;
  console.log(`\n${RULE}`);
  console.log(c("bold", `[${session.mode}] ${session.scenarioTitle}`));
  console.log(c("dim", `${session.orgAId} <-> ${session.orgBId}  |  session ${session.id || "(preview)"}`));
  console.log(RULE);
  for (const m of session.transcript) {
    const roundLabel = `R${m.round}`.padEnd(4);
    const stageLabel = m.stage.padEnd(20);
    const fromLabel = m.from.padEnd(13);
    console.log(`  ${c("dim", roundLabel)}${c(stageColor(m), stageLabel)}${c("dim", fromLabel)}${m.text}`);
  }
  const outcome =
    session.status === "agreed"
      ? c("green", `AGREED -> ${session.proposedSlot?.dateLabel}`)
      : session.status === "escalated"
        ? c("red", "ESCALATED")
        : c("yellow", "IN PROGRESS");
  const progress = session.mode === "with-ioc" ? `${session.stagesCompleted ?? "?"} stage(s)` : `${session.rounds} round(s)`;
  console.log(RULE);
  console.log(`-> ${outcome}   (${progress}, ${((session.durationMs ?? 0) / 1000).toFixed(1)}s simulated)`);
  console.log(`${RULE}\n`);
}

/** One line per run - used for the bulk seed at startup so it doesn't flood the console. */
export function logSummaryLine(session: NegotiationSession): void {
  if (!ENABLED) return;
  console.log(c("dim", `  seeded: [${session.mode}] ${session.scenarioTitle} -> ${session.status}`));
}
