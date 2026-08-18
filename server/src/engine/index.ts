import { DataSharingPolicy, NegotiationMode, NegotiationScenario, NegotiationSession } from "../types/domain";
import { runWithIoc } from "./withIoc";
import { runWithoutIoc } from "./withoutIoc";

export async function runNegotiation(
  scenario: NegotiationScenario,
  mode: NegotiationMode,
  policy: DataSharingPolicy
): Promise<NegotiationSession> {
  return mode === "with-ioc" ? runWithIoc(scenario, policy) : Promise.resolve(runWithoutIoc(scenario));
}

export { runWithIoc, runWithoutIoc };
