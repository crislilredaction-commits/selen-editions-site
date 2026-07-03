import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

async function requireClient() {
  const authSupabase = await createServerSupabaseClient();
  const { data, error } = await authSupabase.auth.getUser();
  const user = data.user;
  if (error || !user?.id) {
    return { ok: false as const, error: "Connexion client requise.", status: 401 };
  }
  return { ok: true as const, user };
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === "on";
}

function trainerRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        id: clean(item.id),
        first_name: clean(item.first_name),
        last_name: clean(item.last_name),
        email: clean(item.email).toLowerCase() || null,
        cv_pending: boolValue(item.cv_pending),
        trainer_access_planned: boolValue(item.trainer_access_planned),
      };
    })
    .filter((row) => row.first_name || row.last_name || row.email);
}

export async function GET() {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getAdminSupabase();
  await supabase.from("daily_subscriptions").upsert(
    {
      user_id: auth.user.id,
      status: "active",
      annual_learner_limit: 150,
      base_monthly_amount_cents: 8900,
      upper_monthly_amount_cents: 14900,
      pricing_rule_accepted_at: new Date().toISOString(),
      pricing_rule_accepted_version: "daily_150_2026_07",
    },
    { onConflict: "user_id" },
  );

  const [onboardingRes, trainersRes, subscriptionRes] = await Promise.all([
    supabase
      .from("daily_onboarding")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    supabase
      .from("daily_trainers")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_subscriptions")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  if (onboardingRes.error) return NextResponse.json({ error: onboardingRes.error.message }, { status: 500 });
  if (trainersRes.error) return NextResponse.json({ error: trainersRes.error.message }, { status: 500 });
  if (subscriptionRes.error) return NextResponse.json({ error: subscriptionRes.error.message }, { status: 500 });

  return NextResponse.json({
    onboarding: onboardingRes.data,
    trainers: trainersRes.data ?? [],
    subscription: subscriptionRes.data,
  });
}

export async function PATCH(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const step = Math.max(1, Math.min(7, Number(body.current_step ?? 1) || 1));
  const status = clean(body.status) === "completed" ? "completed" : "in_progress";
  const now = new Date().toISOString();
  const setupChoice = clean(body.setup_choice);
  const qualiopiStatus = clean(body.qualiopi_status);

  const payload = {
    user_id: auth.user.id,
    status,
    current_step: step,
    setup_choice: setupChoice === "self" || setupChoice === "video" ? setupChoice : null,
    video_requested_at: setupChoice === "video" ? now : null,
    organisation_name: clean(body.organisation_name) || null,
    siret: clean(body.siret) || null,
    nda_number: clean(body.nda_number) || null,
    address: clean(body.address) || null,
    manager_first_name: clean(body.manager_first_name) || null,
    manager_last_name: clean(body.manager_last_name) || null,
    qualiopi_status: ["yes", "no", "planned"].includes(qualiopiStatus) ? qualiopiStatus : null,
    insee_document_pending: boolValue(body.insee_document_pending),
    qualiopi_certificate_pending: boolValue(body.qualiopi_certificate_pending),
    nda_or_bpf_document_pending: boolValue(body.nda_or_bpf_document_pending),
    platform_contact_first_name: clean(body.platform_contact_first_name) || null,
    platform_contact_last_name: clean(body.platform_contact_last_name) || null,
    platform_contact_role: clean(body.platform_contact_role) || null,
    platform_contact_email: clean(body.platform_contact_email).toLowerCase() || null,
    completed_at: status === "completed" ? now : null,
  };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("daily_onboarding")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(body.trainers)) {
    const rows = trainerRows(body.trainers);
    const existingIds = rows.map((row) => row.id).filter(Boolean);

    if (existingIds.length > 0) {
      await supabase
        .from("daily_trainers")
        .delete()
        .eq("user_id", auth.user.id)
        .not("id", "in", `(${existingIds.join(",")})`);
    } else {
      await supabase.from("daily_trainers").delete().eq("user_id", auth.user.id);
    }

    for (const row of rows) {
      const trainerPayload = {
        user_id: auth.user.id,
        first_name: row.first_name || "À compléter",
        last_name: row.last_name || "À compléter",
        email: row.email,
        cv_pending: row.cv_pending,
        trainer_access_planned: row.trainer_access_planned,
      };

      if (row.id) {
        await supabase
          .from("daily_trainers")
          .update(trainerPayload)
          .eq("id", row.id)
          .eq("user_id", auth.user.id);
      } else {
        await supabase.from("daily_trainers").insert(trainerPayload);
      }
    }
  }

  return NextResponse.json({ onboarding: data, savedAt: now });
}
