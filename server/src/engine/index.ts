import { DataSharingPolicy, NegotiationMode, NegotiationScenario, NegotiationSession } from "../types/domain";
import { buildProtocolFrames } from "./protocol";
import { runWithIoc } from "./withIoc";
import { runWithoutIoc } from "./withoutIoc";

export async function runNegotiation(
  scenario: NegotiationScenario,
  mode: NegotiationMode,
  policy: DataSharingPolicy
): Promise<NegotiationSession> {
  const session = mode === "with-ioc" ? await runWithIoc(scenario, policy) : runWithoutIoc(scenario);
  session.protocolFrames = buildProtocolFrames(session);
  return session;
}

export { runWithIoc, runWithoutIoc };
