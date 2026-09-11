type SupabaseAdmin = ReturnType<typeof import("@/lib/server/clientNdaAccess").getAdminSupabase>;

const text = (value: unknown) => String(value ?? "").trim();
const INACTIVE_CONFLICTS = new Set(["declined", "cancelled"]);

export type ConfirmDailyAbandonmentInput = {
  organisationId: string;
  sessionId: string;
  enrolmentId: string;
  reason: string;
  occurredAt: string;
  authorName?: string | null;
};

function validOccurredAt(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export async function confirmDailyEnrolmentAbandonment(admin: SupabaseAdmin, input: ConfirmDailyAbandonmentInput) {
  const organisationId = text(input.organisationId);
  const sessionId = text(input.sessionId);
  const enrolmentId = text(input.enrolmentId);
  const reason = text(input.reason);
  const occurredAt = validOccurredAt(text(input.occurredAt));
  if (!organisationId || !sessionId || !enrolmentId || !reason || !occurredAt) {
    throw new Error("Inscription, date d’abandon et motif sont requis.");
  }

  const { data: enrolment, error: enrolmentError } = await admin
    .from("daily_session_enrolments")
    .select("id,learner_id,status")
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("id", enrolmentId)
    .maybeSingle();
  if (enrolmentError) throw enrolmentError;
  if (!enrolment) throw new Error("Inscription introuvable.");
  if (INACTIVE_CONFLICTS.has(text(enrolment.status))) throw new Error("Cette inscription est déjà inactive et ne peut pas être déclarée abandonnée.");

  if (text(enrolment.status) !== "abandoned") {
    const { error: updateError } = await admin
      .from("daily_session_enrolments")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .eq("id", enrolmentId);
    if (updateError) throw updateError;

    const { error: followupError } = await admin.from("daily_session_followup_entries").insert({
      organisation_id: organisationId,
      session_id: sessionId,
      enrolment_id: enrolmentId,
      entry_type: "incident",
      level: "attention",
      occurred_at: occurredAt,
      summary: "Abandon confirmé",
      description: reason,
      action_taken: "Inscription clôturée pour abandon. Les accès apprenant ont été révoqués ; les preuves déjà acquises sont conservées.",
      status: "resolved",
      resolved_at: new Date().toISOString(),
      author_role: "Organisme de formation",
      author_name: text(input.authorName) || "Organisme de formation",
    });
    if (followupError) throw followupError;
  }

  const learnerId = text(enrolment.learner_id);
  const portalRevoke = admin
    .from("daily_portal_access_tokens")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("portal_type", "learner")
    .eq("entity_key", `learner:${learnerId}`)
    .neq("status", "revoked");
  const attendanceRevoke = admin
    .from("daily_attendance_access_tokens")
    .update({ status: "revoked" })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("enrolment_id", enrolmentId)
    .eq("status", "active");
  const [portalResult, attendanceResult] = await Promise.all([portalRevoke, attendanceRevoke]);
  const revokeError = portalResult.error ?? attendanceResult.error;
  if (revokeError) throw revokeError;

  return { enrolmentId, learnerId, status: "abandoned" as const, alreadyAbandoned: text(enrolment.status) === "abandoned" };
}
