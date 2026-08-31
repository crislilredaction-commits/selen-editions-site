import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

const PROFILE_CHANGE_KEYS: Record<string, Set<string>> = {
  legal_identity: new Set(["legal_name"]),
  siret: new Set(["siret"]),
  legal_form: new Set(["legal_form"]),
  legal_representative: new Set(["legal_representative_name", "legal_representative_email"]),
  nda: new Set(["nda_number", "nda_status", "nda_declared_at"]),
  qualiopi: new Set(["qualiopi_status", "qualiopi_valid_from", "qualiopi_valid_until", "qualiopi_categories"]),
  vat: new Set(["vat_number"]),
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item)).filter(Boolean) : [];
}

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  return NextResponse.json({ workspace: context.workspace });
}

export async function PATCH(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action);
  const organisationId = context.workspace.membership.organisation_id;
  const { supabase, user } = context;

  if (action === "update_safe_profile") {
    if (!context.workspace.capabilities.legal_profile) {
      return NextResponse.json({ error: "Accès au profil de l’organisme requis." }, { status: 403 });
    }
    const source = body.values && typeof body.values === "object" ? body.values as Record<string, unknown> : {};
    const { error } = await supabase.rpc("daily_client_update_safe_organisation", {
      p_organisation_id: organisationId,
      p_administrative_email: clean(source.administrative_email) || null,
      p_administrative_phone: clean(source.administrative_phone) || null,
      p_administrative_address: clean(source.administrative_address) || null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "request_profile_change") {
    if (!context.workspace.capabilities.legal_profile) {
      return NextResponse.json({ error: "Accès au profil légal requis." }, { status: 403 });
    }
    const requestType = clean(body.request_type);
    const allowed = PROFILE_CHANGE_KEYS[requestType];
    if (!allowed) return NextResponse.json({ error: "Type de modification invalide." }, { status: 400 });
    const source = body.values && typeof body.values === "object" ? body.values as Record<string, unknown> : {};
    const proposed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (!allowed.has(key)) continue;
      if (key === "qualiopi_categories") proposed[key] = cleanStringArray(value);
      else if (key === "nda_status" && clean(value) === "active") proposed[key] = "registered";
      else proposed[key] = clean(value) || null;
    }
    if (Object.keys(proposed).length === 0) return NextResponse.json({ error: "Aucune modification proposée." }, { status: 400 });
    const { error } = await supabase.from("daily_organisation_profile_change_requests").insert({
      organisation_id: organisationId,
      requested_by: user.id,
      request_type: requestType,
      proposed_changes: proposed,
      status: "pending",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "set_user_access") {
    const { error } = await supabase.rpc("daily_client_set_membership_access", {
      p_organisation_id: organisationId,
      p_membership_id: clean(body.membership_id),
      p_roles: cleanStringArray(body.roles),
      p_permission_blocks: cleanStringArray(body.permission_blocks),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "set_user_status") {
    const { error } = await supabase.rpc("daily_client_set_membership_status", {
      p_organisation_id: organisationId,
      p_membership_id: clean(body.membership_id),
      p_status: clean(body.status),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "save_trainer") {
    const trainerId = clean(body.id);
    const payload = {
      organisation_id: organisationId,
      display_name: clean(body.display_name),
      professional_email: clean(body.professional_email).toLowerCase() || null,
      phone: clean(body.phone) || null,
      biography: clean(body.biography) || null,
      specialties: cleanStringArray(body.specialties),
      engagement_type: clean(body.engagement_type) || "external",
      status: clean(body.status) === "pending_selen_review" ? "pending_selen_review" : "draft",
      submitted_at: clean(body.status) === "pending_selen_review" ? new Date().toISOString() : null,
    };
    if (!payload.display_name) return NextResponse.json({ error: "Nom du formateur requis." }, { status: 400 });
    const query = trainerId
      ? supabase.from("daily_trainer_profiles").update(payload).eq("id", trainerId).eq("organisation_id", organisationId)
      : supabase.from("daily_trainer_profiles").insert(payload);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "save_certification" || action === "delete_certification") {
    return NextResponse.json(
      {
        error:
          "Les certifications sont gérées par le formateur depuis son espace. Elles sont disponibles en consultation seule pour l’organisme et les agents.",
      },
      { status: 403 },
    );
  } else {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }

  const refreshed = await getDailyClientWorkspace();
  if (!refreshed.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: true, workspace: refreshed.workspace });
}
