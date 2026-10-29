import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { OwnPositioningError } from "@/lib/server/dailyOwnPositioning";

type Json = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const email = (value: unknown) => text(value).toLowerCase();
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const row = (value: unknown): Json | null => Array.isArray(value) ? row(value[0]) : value && typeof value === "object" ? value as Json : null;
export async function resolveLearnerOwnPositioning(token: string) {
  const auth = await createClient();
  const { data: identity, error: identityError } = await auth.auth.getUser();
  if (identityError || !identity.user || !email(identity.user.email)) throw new OwnPositioningError("Connectez-vous à votre espace apprenant pour consulter ce document privé.", 401);
  const admin = getAdminSupabase();
  const { data: access, error } = await admin.from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_key,entity_email,status,expires_at,metadata").eq("token", token).maybeSingle();
  if (error) throw new OwnPositioningError("Vérification de l’accès indisponible.", 500);
  if (!access || access.portal_type !== "learner") throw new OwnPositioningError("Accès apprenant introuvable.", 404);
  if (!["pending", "sent", "viewed"].includes(text(access.status))) throw new OwnPositioningError("Cet accès n’est plus actif.", 403);
  if (access.expires_at && (!Number.isFinite(Date.parse(access.expires_at)) || Date.parse(access.expires_at) <= Date.now())) throw new OwnPositioningError("Ce lien a expiré.", 410);
  if (email(access.entity_email) !== email(identity.user.email)) throw new OwnPositioningError("Cet accès appartient à un autre apprenant.", 403);
  const metadata = row(access.metadata) ?? {};
  const keyId = /^learner:([0-9a-f-]{36})$/.exec(text(access.entity_key).toLowerCase())?.[1];
  const learnerId = text(metadata.learner_id).toLowerCase() || keyId;
  if (!learnerId || !uuid.test(learnerId) || (keyId && keyId !== learnerId) || (text(metadata.enrolment_id) && !uuid.test(text(metadata.enrolment_id).toLowerCase()))) throw new OwnPositioningError("Cet accès doit être renouvelé par votre organisme de formation.", 403);
  const { data: session, error: sessionError } = await admin.from("daily_sessions")
    .select("id,organisation_id,formation_id,status,daily_formations(id,organisation_id,status,title,positioning_mode,positioning_questionnaire_document_url)")
    .eq("id", access.session_id).neq("status", "archived").maybeSingle();
  if (sessionError) throw new OwnPositioningError("Lecture de la session indisponible.", 500);
  const formation = row(session?.daily_formations);
  if (!session || !formation || formation.id !== session.formation_id || formation.organisation_id !== session.organisation_id || formation.status === "archived") throw new OwnPositioningError("Session introuvable.", 404);
  let query = admin.from("daily_session_enrolments")
    .select("id,organisation_id,session_id,learner_id,status,positioning_status,daily_learners(id,organisation_id,first_name,last_name,email)")
    .eq("organisation_id", session.organisation_id).eq("session_id", session.id).eq("learner_id", learnerId)
    .not("status", "in", "(declined,cancelled,abandoned)");
  if (text(metadata.enrolment_id)) query = query.eq("id", text(metadata.enrolment_id).toLowerCase());
  const { data: enrolment, error: enrolmentError } = await query.maybeSingle();
  if (enrolmentError) throw new OwnPositioningError("Lecture de l’inscription indisponible.", 500);
  const learner = row(enrolment?.daily_learners);
  if (!enrolment || !learner || learner.id !== learnerId || learner.organisation_id !== session.organisation_id || email(learner.email) !== email(identity.user.email)) throw new OwnPositioningError("Inscription apprenant active introuvable.", 404);
  return { admin, session, formation, enrolment, learner };
}
export type LearnerOwnPositioningContext = Awaited<ReturnType<typeof resolveLearnerOwnPositioning>>;
export async function learnerPositioningEvidence(context: LearnerOwnPositioningContext, sourceId?: string, documentId?: string) {
  let query = context.admin.from("daily_documents")
    .select("id,bucket,storage_path,mime_type,metadata,created_at,is_current,status")
    .eq("organisation_id", context.session.organisation_id).eq("formation_id", context.session.formation_id)
    .eq("session_id", context.session.id).eq("learner_id", context.enrolment.learner_id)
    .eq("enrolment_id", context.enrolment.id).eq("linked_object_type", "enrolment").eq("linked_object_id", context.enrolment.id)
    .eq("document_type", "positioning_evidence").neq("status", "archived");
  if (documentId) query = query.eq("id", documentId);
  else query = query.eq("is_current", true);
  if (sourceId) query = query.contains("metadata", { source_document_id: sourceId });
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new OwnPositioningError("Lecture du positionnement indisponible.", 500);
  if (!data || data.bucket !== "documents" || !String(data.storage_path ?? "").startsWith(`daily/${context.session.organisation_id}/`)) return null;
  return { ...data, name: text((data.metadata as Json)?.original_filename) || "Positionnement rempli" };
}
