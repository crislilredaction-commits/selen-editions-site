import type { AgentAssistanceContext } from "@/lib/server/agentAssistance";

export type DelegatedRegistrationDecision = "accepted" | "refused";

/**
 * Fail closed: a Studio-assisted candidature decision must be tied to a live
 * assistance session, the exact organisation and an identified Studio actor.
 * This guard does not grant SQL permissions; the decision RPC must enforce
 * the same scope independently before delegated writes are enabled.
 */
export function assertDelegatedRegistrationDecision(
  assistance: AgentAssistanceContext,
  organisationId: string,
  decision: DelegatedRegistrationDecision,
  confirmed: boolean,
) {
  if (
    assistance.organisation_id !== organisationId ||
    assistance.metadata?.scope !== "daily_workspace" ||
    !assistance.agent_user_id ||
    !confirmed ||
    !["accepted", "refused"].includes(decision)
  ) {
    throw new Error("Décision déléguée non autorisée ou non confirmée.");
  }
  return { agentUserId: assistance.agent_user_id, assistanceId: assistance.id };
}

