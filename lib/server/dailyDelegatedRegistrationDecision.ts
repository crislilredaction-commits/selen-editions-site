import { createHash } from "node:crypto";
import type { AgentAssistanceContext } from "@/lib/server/agentAssistance";

export type DelegatedRegistrationDecision = "accepted" | "refused";

/**
 * Fail closed: a Studio-assisted candidature decision must be tied to a live
 * assistance session, the exact organisation and an identified Studio actor.
 * This guard does not grant SQL permissions; the decision RPC must enforce
 * the same scope independently before delegated writes are enabled.
 */
export function getDelegatedRegistrationActor(
  assistance: AgentAssistanceContext & { status?: string },
  organisationId: string,
) {
  const expiresAt = new Date(assistance.expires_at).getTime();
  if (
    assistance.organisation_id !== organisationId ||
    (assistance.metadata?.scope && assistance.metadata.scope !== "daily_workspace") ||
    assistance.status !== "active" ||
    !assistance.agent_user_id ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  ) throw new Error("Délégation Studio invalide ou expirée.");
  return { agentUserId: assistance.agent_user_id, assistanceId: assistance.id };
}

export function registrationAssistanceToken(req?: Request) {
  if (!req) return "";
  return new URL(req.url).searchParams.get("assistanceToken")?.trim()
    || req.headers?.get("x-selen-agent-assistance")?.trim() || "";
}

export function assertDelegatedRegistrationDecision(
  assistance: AgentAssistanceContext,
  organisationId: string,
  decision: DelegatedRegistrationDecision,
  confirmed: boolean,
) {
  const actor = getDelegatedRegistrationActor(assistance, organisationId);
  if (!confirmed || !["accepted", "refused"].includes(decision)) {
    throw new Error("Décision déléguée non autorisée ou non confirmée.");
  }
  return actor;
}

export function delegatedRegistrationTokenHash(req: Request) {
  const token = registrationAssistanceToken(req);
  if (!token) throw new Error("Délégation Studio manquante.");
  return createHash("sha256").update(token).digest("hex");
}

