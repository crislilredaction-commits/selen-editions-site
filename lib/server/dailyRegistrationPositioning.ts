import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { loadOriginalPositioning, OwnPositioningError } from "@/lib/server/dailyOwnPositioning";

export async function resolveRegistrationPositioning(token: string) {
  const admin = getAdminSupabase();
  const { data: session, error: sessionError } = await admin.from("daily_sessions")
    .select("id,formation_id,organisation_id,status").eq("registration_token", token).neq("status", "archived").maybeSingle();
  if (sessionError) throw new OwnPositioningError("Lecture de la candidature indisponible.", 500);
  const query = admin.from("daily_formations")
    .select("id,organisation_id,status,positioning_mode,positioning_questionnaire_document_url").neq("status", "archived");
  const { data: formation, error } = session
    ? await query.eq("id", session.formation_id).eq("organisation_id", session.organisation_id).maybeSingle()
    : await query.eq("public_registration_token", token).eq("public_registration_enabled", true).maybeSingle();
  if (error) throw new OwnPositioningError("Lecture de la formation indisponible.", 500);
  if (!formation) throw new OwnPositioningError("Lien introuvable ou expiré.", 404);
  const original = await loadOriginalPositioning(admin, formation);
  if (!original) throw new OwnPositioningError("Cette formation ne propose pas de questionnaire importé.", 404);
  return { admin, original };
}
