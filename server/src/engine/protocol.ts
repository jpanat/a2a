// Projects a NegotiationSession's transcript into an explicit, ACL-style
// ("Agent Communication Language") protocol trace - the same events, framed
// as sender/receiver/performative/content frames the way a real agent-to-
// agent protocol log would look, instead of prose sentences. This is a pure
// display-layer view computed from the transcript; it isn't a second source
// of truth and doesn't change what the engine decided.
import { NegotiationSession, ProtocolFrame, TranscriptMessage } from "../types/domain";

const PERFORMATIVE_BY_KIND: Record<TranscriptMessage["kind"], string> = {
  proposal: "PROPOSE",
  "counter-proposal": "PROPOSE",
  rejection: "REJECT_PROPOSAL",
  resolution: "CONFIRM",
  escalation: "FAILURE",
  mapping: "INFORM_ONTOLOGY",
  intent: "INFORM_INTENT",
  info: "INFORM",
  identity: "INFORM_IDENTITY",
  "term-alignment": "INFORM_TERMS",
  drift: "INFORM_DRIFT",
  realignment: "REALIGN",
  "loop-detected": "FAILURE_CYCLE",
  "mediation-offer": "MEDIATE_OFFER",
  "mediation-accept": "MEDIATE_ACCEPT",
};

function receiverFor(from: TranscriptMessage["from"]): TranscriptMessage["from"] | "broadcast" {
  if (from === "webex-agent") return "copilot-agent";
  if (from === "copilot-agent") return "webex-agent";
  return "broadcast";
}

export function buildProtocolFrames(session: NegotiationSession): ProtocolFrame[] {
  const protocol = session.mode === "with-ioc" ? "csp-a2a/1.0" : "adhoc-a2a/0.1";
  return session.transcript.map((m, i) => ({
    seq: i + 1,
    performative: PERFORMATIVE_BY_KIND[m.kind] ?? "INFORM",
    sender: m.from,
    receiver: receiverFor(m.from),
    protocol,
    round: m.round,
    stage: m.stage,
    content: m.data ?? {},
    text: m.text,
    timestamp: m.timestamp,
  }));
}
