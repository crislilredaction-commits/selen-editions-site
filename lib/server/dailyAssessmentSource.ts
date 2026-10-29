import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { positioningSourceDocumentId, OWN_POSITIONING_MIME_TYPES } from "@/lib/daily/ownPositioning";

export async function verifyDailyAssessmentSource(admin: SupabaseClient, organisationId: string, formationId: string, reference: unknown) {
  const id = positioningSourceDocumentId(reference);
  if (!id) throw new Error("Le questionnaire d’évaluation doit être importé dans Selen.");
  const { data, error } = await admin.from("daily_documents")
    .select("id,organisation_id,formation_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,mime_type,sha256,is_current,status,archived_at")
    .eq("id", id).eq("organisation_id", organisationId).eq("document_type", "learning_assessment_source")
    .eq("linked_object_type", "organisation").eq("linked_object_id", organisationId).maybeSingle();
  if (error || !data || data.bucket !== "documents" || !data.is_current || data.status === "archived" || data.archived_at
    || (data.formation_id && data.formation_id !== formationId)
    || typeof data.storage_path !== "string" || !data.storage_path.startsWith("daily/" + organisationId + "/")
    || /[\\%\u0000-\u001f]/.test(data.storage_path) || data.storage_path.split("/").some((part: string) => !part || part === "." || part === "..")
    || !/^[a-f0-9]{64}$/i.test(data.sha256 || "") || !(OWN_POSITIONING_MIME_TYPES as readonly string[]).includes(data.mime_type)) throw new Error("Le questionnaire d’évaluation privé n’est plus disponible. Rechargez la formation.");
  const file = await admin.storage.from("documents").download(data.storage_path);
  if (file.error || !file.data || createHash("sha256").update(new Uint8Array(await file.data.arrayBuffer())).digest("hex") !== data.sha256.toLowerCase()) throw new Error("Le fichier d’évaluation ne correspond pas à sa preuve enregistrée.");
}
