import type { SupabaseClient } from "@supabase/supabase-js";
import { logAgentAssistanceAction, type AgentAssistanceContext } from "@/lib/server/agentAssistance";

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

/** Write an attributable assistance audit record. Reject if persistence fails. */
export async function auditDelegatedRegistrationDecision(
  supabase: SupabaseClient,
  req: Request,
  assistance: AgentAssistanceContext,
  requestId: string,
  decision: DelegatedRegistrationDecision,
) {
  // The canonical audit helper is used here; its persistence must be made
  // fail-closed in the final atomic decision implementation.
  await logAgentAssistanceAction({
    supabase,
    req,
    assistance,
    action: "daily_registration_request_decision",
    actionLabel: decision === "accepted" ? "Candidature acceptée en délégation" : "Candidature refusée en délégation",
    metadata: { registration_request_id: requestId, decision },
  });
}
