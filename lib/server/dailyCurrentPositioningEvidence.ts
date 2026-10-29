import type { SupabaseClient } from "@supabase/supabase-js";
import { OWN_POSITIONING_MIME_TYPES, positioningSourceDocumentId } from "@/lib/daily/ownPositioning";

type Evidence = { document_type?: string | null; formation_id?: string | null; metadata?: unknown; status?: string | null };
type Formation = { id: string; organisation_id: string; positioning_mode?: string; positioning_questionnaire_document_url?: string };
const record = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) return record(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
};
function isOwnPositioning(document: Evidence) {
  const source = record(document.metadata)?.source;
  return document.document_type === "positioning_evidence" &&
    (source === "daily_own_positioning" || source === "daily_learner_own_positioning");
}

/** Signed rows are immutable history. Current reads must also check their source version. */
export async function filterCurrentOwnPositioningEvidence<T extends Evidence>(args: {
  admin: SupabaseClient; organisationId: string; formations: unknown[]; documents: T[];
}): Promise<T[]> {
  const ownDocuments = args.documents.filter(isOwnPositioning);
  if (!ownDocuments.length) return args.documents;
  const formationIds = new Set(ownDocuments.map(document => document.formation_id));
  const formations = new Map<string, Formation>();
  for (const relation of args.formations) {
    const formation = record(relation);
    if (typeof formation?.id === "string" && formation.organisation_id === args.organisationId && formationIds.has(formation.id)) {
      formations.set(formation.id, formation as Formation);
    }
  }
  const sourceIds = [...new Set([...formations.values()].filter(formation => formation.positioning_mode === "off_platform")
    .map(formation => positioningSourceDocumentId(formation.positioning_questionnaire_document_url)).filter((id): id is string => Boolean(id)))];
  const originals = new Map<string, { sha256: string; formation_id: string | null }>();
  if (sourceIds.length) {
    const { data, error } = await args.admin.from("daily_documents")
      .select("id,organisation_id,formation_id,document_type,linked_object_type,linked_object_id,bucket,storage_path,sha256,mime_type,status,is_current")
      .eq("organisation_id", args.organisationId).eq("document_type", "positioning_questionnaire_source")
      .eq("is_current", true).neq("status", "archived").in("id", sourceIds);
    if (error) throw new Error("Vérification de la version du positionnement indisponible.");
    for (const original of data ?? []) {
      if (original.linked_object_type === "organisation" && original.linked_object_id === args.organisationId &&
        original.bucket === "documents" && String(original.storage_path ?? "").startsWith(`daily/${args.organisationId}/`) &&
        /^[a-f0-9]{64}$/i.test(String(original.sha256 ?? "")) &&
        (OWN_POSITIONING_MIME_TYPES as readonly string[]).includes(String(original.mime_type ?? ""))) {
        originals.set(original.id, { sha256: original.sha256, formation_id: original.formation_id });
      }
    }
  }
  return args.documents.filter(document => {
    // Existing Selen and manually recorded assessment proofs retain their existing behavior.
    if (!isOwnPositioning(document)) return true;
    const formation = formations.get(String(document.formation_id ?? ""));
    if (!formation || formation.positioning_mode !== "off_platform" || document.status === "archived") return false;
    const sourceId = positioningSourceDocumentId(formation.positioning_questionnaire_document_url);
    const original = sourceId ? originals.get(sourceId) : null;
    const metadata = record(document.metadata);
    return Boolean(original && (!original.formation_id || original.formation_id === formation.id) &&
      metadata?.source_document_id === sourceId && metadata.source_sha256 === original.sha256);
  });
}
