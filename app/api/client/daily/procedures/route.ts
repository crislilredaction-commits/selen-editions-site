import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const definitions = [
  { procedure_type: "learner_administration", title: "Parcours administratif de l’apprenant et remise des documents" },
  { procedure_type: "stakeholder_satisfaction", title: "Satisfaction des parties prenantes" },
  { procedure_type: "absence_dropout", title: "Prévention et gestion des absences et abandons" },
] as const;
const allowedTypes = new Set(definitions.map((item) => item.procedure_type));

async function ensureProcedures(organisationId: string) {
  const admin = getAdminSupabase();
  const { error: upsertError } = await admin.from("daily_internal_procedures").upsert(
    definitions.map((item) => ({ organisation_id: organisationId, ...item })),
    { onConflict: "organisation_id,procedure_type", ignoreDuplicates: true },
  );
  if (upsertError) throw upsertError;
  const { data, error } = await admin
    .from("daily_internal_procedures")
    .select("id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    const procedures = await ensureProcedures(context.workspace.membership.organisation_id);
    return NextResponse.json({ procedures });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Procédures indisponibles." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.legal_profile) {
    return NextResponse.json({ error: "Accès au profil de l’organisme requis." }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const procedureType = String(body.procedureType ?? "");
    if (!allowedTypes.has(procedureType as (typeof definitions)[number]["procedure_type"])) {
      return NextResponse.json({ error: "Type de procédure invalide." }, { status: 400 });
    }
    const status = String(body.status ?? "draft");
    if (!["draft", "active"].includes(status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    const definition = definitions.find((item) => item.procedure_type === procedureType)!;
    const now = new Date().toISOString();
    const values = {
      organisation_id: context.workspace.membership.organisation_id,
      procedure_type: procedureType,
      title: definition.title,
      purpose: String(body.purpose ?? "").trim() || null,
      steps: String(body.steps ?? "").trim(),
      responsibilities: String(body.responsibilities ?? "").trim() || null,
      evidence: String(body.evidence ?? "").trim() || null,
      status,
      reviewed_at: status === "active" ? now : null,
      updated_at: now,
    };
    const { data, error } = await getAdminSupabase()
      .from("daily_internal_procedures")
      .upsert(values, { onConflict: "organisation_id,procedure_type" })
      .select("id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ procedure: data });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Enregistrement impossible." }, { status: 500 });
  }
}
