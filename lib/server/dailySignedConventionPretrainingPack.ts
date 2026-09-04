import { sendDailyConvocation } from "@/lib/server/dailyPretrainingEmails";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type AdminSupabase = ReturnType<typeof getAdminSupabase>;

type DispatchResult =
  | { status: "waiting_for_signatures" }
  | { status: "inactive_enrolment" }
  | { status: "missing_convocation" }
  | { status: "missing_recipient_email" }
  | { status: "already_sent"; convocationId: string }
  | { status: "sent"; convocationId: string }
  | { status: "send_failed"; convocationId: string; reason: string };

type FormationRelation = { title?: unknown };
type SessionRelation = {
  internal_reference?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  daily_formations?: FormationRelation | FormationRelation[] | null;
};

const inactiveEnrolmentStatuses = new Set(["declined", "cancelled", "abandoned"]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Déclenche le pack pré-formation uniquement lorsque toutes les signatures
 * attendues pour une convention sont effectivement enregistrées.
 *
 * V1 : le livret d'accueil est annexé à la convocation générée par Daily.
 * Le statut `sent` de la convocation sert de garde-fou de réémission lors
 * des relectures/requêtes ultérieures du lien de signature.
 */
export async function dispatchPretrainingPackAfterConventionSigned(
  supabase: AdminSupabase,
  conventionId: string,
): Promise<DispatchResult> {
  const { data: signatures, error: signaturesError } = await supabase
    .from("daily_convention_signatures")
    .select("id,status")
    .eq("convention_id", conventionId);

  if (signaturesError) throw new Error(signaturesError.message);
  if (!signatures?.length || signatures.some((row) => row.status !== "signed")) {
    return { status: "waiting_for_signatures" };
  }

  const { data: convention, error: conventionError } = await supabase
    .from("daily_conventions")
    .select("id,session_id,recipient_type,recipient_key,recipient_name,recipient_email,company_name")
    .eq("id", conventionId)
    .maybeSingle();

  if (conventionError) throw new Error(conventionError.message);
  if (!convention) throw new Error("Convention Daily introuvable après signature.");

  // Les conventions bénéficiaires utilisent leur inscription comme recipient_key.
  // On vérifie ce lien avant tout envoi automatique afin qu'une signature rejouée
  // ne puisse pas contourner les gardes des routes d'envoi manuel.
  const recipientKey = clean(convention.recipient_key);
  if (isUuid(recipientKey)) {
    const { data: enrolment, error: enrolmentError } = await supabase
      .from("daily_session_enrolments")
      .select("id,status")
      .eq("id", recipientKey)
      .eq("session_id", convention.session_id)
      .maybeSingle();

    if (enrolmentError) throw new Error(enrolmentError.message);
    if (enrolment && inactiveEnrolmentStatuses.has(clean(enrolment.status))) {
      return { status: "inactive_enrolment" };
    }
  }

  const { data: convocation, error: convocationError } = await supabase
    .from("daily_convocations")
    .select(`
      id,
      session_id,
      recipient_type,
      recipient_key,
      recipient_name,
      recipient_email,
      version,
      document_name,
      storage_path,
      status,
      sent_at,
      daily_sessions(
        internal_reference,
        start_date,
        end_date,
        daily_formations(title)
      )
    `)
    .eq("session_id", convention.session_id)
    .eq("recipient_type", convention.recipient_type)
    .eq("recipient_key", convention.recipient_key)
    .neq("status", "archived")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (convocationError) throw new Error(convocationError.message);
  if (!convocation) return { status: "missing_convocation" };
  if (convocation.status === "sent" || convocation.sent_at) {
    return { status: "already_sent", convocationId: convocation.id };
  }

  const recipientEmail = clean(convocation.recipient_email || convention.recipient_email);
  if (!recipientEmail) return { status: "missing_recipient_email" };

  const { data: file, error: fileError } = await supabase.storage
    .from("documents")
    .download(convocation.storage_path);
  if (fileError || !file) {
    const reason = fileError?.message || "Document de convocation introuvable.";
    await supabase
      .from("daily_convocations")
      .update({ last_error: reason })
      .eq("id", convocation.id);
    return { status: "send_failed", convocationId: convocation.id, reason };
  }

  const session = firstRelation(convocation.daily_sessions as SessionRelation | SessionRelation[] | null);
  const formation = firstRelation(session?.daily_formations);
  const attachmentBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await sendDailyConvocation({
    email: recipientEmail,
    learnerName: clean(convocation.recipient_name || convention.recipient_name || convention.company_name),
    formationTitle: clean(formation?.title) || "Formation",
    sessionReference: clean(session?.internal_reference),
    startDate: clean(session?.start_date),
    endDate: clean(session?.end_date),
    documentVersion: Number(convocation.version ?? 1),
    attachmentFilename: clean(convocation.document_name) || "convocation-livret-accueil.doc",
    attachmentBase64,
  });

  if (!result.sent) {
    const reason = result.reason;
    await supabase
      .from("daily_convocations")
      .update({ last_error: reason })
      .eq("id", convocation.id);
    return { status: "send_failed", convocationId: convocation.id, reason };
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("daily_convocations")
    .update({ status: "sent", sent_at: sentAt, last_error: null })
    .eq("id", convocation.id)
    .eq("status", "generated");
  if (updateError) throw new Error(updateError.message);

  return { status: "sent", convocationId: convocation.id };
}
