import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const PHONE_FOLLOWUP_SOURCE = "satisfaction_phone_followup";

type AdminClient = ReturnType<typeof getAdminSupabase>;

type FinalizeInput = {
  organisationId: string;
  sessionId: string;
  enrolmentId: string;
  submittedAt: string;
};

/**
 * Closes every delivery artefact that has no remaining business action once an
 * enrolled learner has answered the canonical satisfaction questionnaire.
 *
 * The response itself remains in daily_learner_feedback_responses. Its free
 * text must not be copied to the trainer-visible session follow-up timeline.
 */
export async function finalizeDailyLearnerSatisfaction(
  admin: AdminClient,
  input: FinalizeInput,
) {
  const [tokens, phoneFollowups] = await Promise.all([
    admin
      .from("daily_learner_feedback_tokens")
      .update({ status: "submitted", last_used_at: input.submittedAt })
      .eq("organisation_id", input.organisationId)
      .eq("session_id", input.sessionId)
      .eq("enrolment_id", input.enrolmentId)
      .eq("status", "active"),
    admin
      .from("daily_quality_actions")
      .update({
        status: "closed",
        implemented_at: input.submittedAt,
        implemented_improvement: "Réponse satisfaction reçue : relance téléphonique devenue sans objet.",
      })
      .eq("organisation_id", input.organisationId)
      .eq("session_id", input.sessionId)
      .eq("source_type", PHONE_FOLLOWUP_SOURCE)
      .eq("source_id", input.enrolmentId)
      .in("status", ["open", "planned"]),
  ]);

  const error = tokens.error ?? phoneFollowups.error;
  if (error) throw new Error(error.message);
}
