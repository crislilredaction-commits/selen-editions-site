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
        cv_url: clean(item.cv_url) || null,
        cv_pending: boolValue(item.cv_pending),
        trainer_access_planned: true,
        trainer_access_status: clean(item.trainer_access_status) || "to_prepare",
      };
    })
    .filter((row) => row.first_name || row.last_name || row.email);
}

function buildSupportTasks(payload: {
  insee_document_pending: boolean;
  qualiopi_certificate_pending: boolean;
  nda_or_bpf_document_pending: boolean;
  welcome_booklet_pending: boolean;
}) {
  return [
    payload.insee_document_pending
      ? { key: "insee", label: "Avis INSEE à fournir", status: "todo" }
      : null,
    payload.qualiopi_certificate_pending
      ? { key: "qualiopi_certificate", label: "Certificat Qualiopi à fournir", status: "todo" }
      : null,
    payload.nda_or_bpf_document_pending
      ? { key: "nda_or_bpf", label: "Attestation NDA ou dernier BPF à fournir", status: "todo" }
      : null,
    payload.welcome_booklet_pending
      ? { key: "welcome_booklet", label: "Livret d'accueil à fournir", status: "todo" }
      : null,
  ].filter(Boolean);
}

async function getDailyAccessState(userId: string) {
  const supabase = getAdminSupabase();

  const [accessRes, subscriptionRes] = await Promise.all([
    supabase
      .from("selen_client_tool_access")
      .select("id,status,access_type,starts_at,ends_at")
      .eq("user_id", userId)
      .eq("tool_slug", "selen-daily")
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("daily_subscriptions")
      .select("id,status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (accessRes.error) {
    return { ok: false as const, error: accessRes.error.message };
  }

  if (subscriptionRes.error) {
    return { ok: false as const, error: subscriptionRes.error.message };
  }

  const access = accessRes.data;
  const now = new Date();
  const accessIsActive =
    Boolean(access) &&
    (access?.access_type === "unlimited" ||
      (!access?.starts_at ||
        new Date(access.starts_at) <= now) &&
        (!access?.ends_at || new Date(access.ends_at) >= now));
  const subscriptionIsActive = Boolean(subscriptionRes.data);

  return {
    ok: true as const,
    hasAccess: accessIsActive || subscriptionIsActive,
    hasCatalogAccess: accessIsActive,
    hasSubscription: subscriptionIsActive,
  };
}

async function ensureDailySubscription(userId: string) {
  const supabase = getAdminSupabase();
  const { error } = await supabase.from("daily_subscriptions").upsert(
    {
      user_id: userId,
      status: "active",
      annual_learner_limit: 150,
      base_monthly_amount_cents: 8900,
      upper_monthly_amount_cents: 14900,
      pricing_rule_accepted_at: new Date().toISOString(),
      pricing_rule_accepted_version: "daily_150_2026_07",
    },
    { onConflict: "user_id" },
  );

  return error;
}

async function ensureDailyOnboarding(userId: string) {
  const supabase = getAdminSupabase();

  const { data: existing, error: existingError } = await supabase
    .from("daily_onboarding")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    return { data: null, error: existingError };
  }

  if (existing) {
    return { data: existing, error: null };
  }

  return supabase
    .from("daily_onboarding")
    .upsert(
      {
        user_id: userId,
        status: "not_started",
        current_step: 1,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
}

export async function GET() {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getAdminSupabase();
  const access = await getDailyAccessState(auth.user.id);

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 500 });
  }

  if (!access.hasAccess) {
    console.warn("Selen Daily onboarding : accès absent.", {
      userId: auth.user.id,
      email: auth.user.email,
    });
    return NextResponse.json(
      {
        error:
          "Aucun accès Selen Daily actif n'est associé à ce compte. Revenez au bureau Selen ou contactez Selen.",
      },
      { status: 403 },
    );
  }

  if (!access.hasSubscription) {
    const subscriptionError = await ensureDailySubscription(auth.user.id);
    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
    }
  }

  const onboardingInit = await ensureDailyOnboarding(auth.user.id);

  if (onboardingInit.error) {
    return NextResponse.json({ error: onboardingInit.error.message }, { status: 500 });
  }

  const [trainersRes, subscriptionRes, templatesRes] = await Promise.all([
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
    supabase
      .from("daily_document_templates")
      .select("*")
      .eq("user_id", auth.user.id)
      .eq("status", "active"),
  ]);

  if (trainersRes.error) return NextResponse.json({ error: trainersRes.error.message }, { status: 500 });
  if (subscriptionRes.error) return NextResponse.json({ error: subscriptionRes.error.message }, { status: 500 });

  const templatesMissing = templatesRes.error?.code === "42P01";
  if (templatesRes.error && !templatesMissing) {
    return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    hasAccess: true,
    onboarding: onboardingInit.data,
    trainers: trainersRes.data ?? [],
    subscription: subscriptionRes.data,
    documentTemplates: templatesMissing ? [] : templatesRes.data ?? [],
  });
}

export async function PATCH(req: Request) {
  const auth = await requireClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const access = await getDailyAccessState(auth.user.id);

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: 500 });
  }

  if (!access.hasAccess) {
    return NextResponse.json(
      {
        error:
          "Aucun accès Selen Daily actif n'est associé à ce compte. Revenez au bureau Selen ou contactez Selen.",
      },
      { status: 403 },
    );
  }

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
    welcome_booklet_pending: boolValue(body.welcome_booklet_pending),
    insee_document_url: clean(body.insee_document_url) || null,
    qualiopi_certificate_url: clean(body.qualiopi_certificate_url) || null,
    nda_or_bpf_document_url: clean(body.nda_or_bpf_document_url) || null,
    welcome_booklet_url: clean(body.welcome_booklet_url) || null,
    platform_contact_first_name: clean(body.platform_contact_first_name) || null,
    platform_contact_last_name: clean(body.platform_contact_last_name) || null,
    platform_contact_role: clean(body.platform_contact_role) || null,
    platform_contact_email: clean(body.platform_contact_email).toLowerCase() || null,
    organisation_logo_url: clean(body.organisation_logo_url) || null,
    support_tasks: buildSupportTasks({
      insee_document_pending: boolValue(body.insee_document_pending),
      qualiopi_certificate_pending: boolValue(body.qualiopi_certificate_pending),
      nda_or_bpf_document_pending: boolValue(body.nda_or_bpf_document_pending),
      welcome_booklet_pending: boolValue(body.welcome_booklet_pending),
    }),
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
        cv_url: row.cv_url,
        cv_pending: row.cv_pending,
        trainer_access_planned: true,
        trainer_access_status: row.trainer_access_status,
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

  if (Array.isArray(body.document_templates)) {
    const templateRows = (body.document_templates as unknown[])
      .map((row: unknown) => {
        const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return {
          user_id: auth.user.id,
          document_type: clean(item.document_type),
          template_source: "CLIENT",
          template_name: clean(item.template_name) || clean(item.document_type),
          public_url: clean(item.public_url) || null,
          status: clean(item.public_url) ? "active" : "archived",
        };
      })
      .filter((row: { document_type: string; template_name: string }) => row.document_type && row.template_name);
    if (templateRows.length > 0) {
      await supabase.from("daily_document_templates").upsert(templateRows, {
        onConflict: "user_id,document_type,template_source,template_name,template_version",
      });
    }
  }

  return NextResponse.json({ onboarding: data, savedAt: now });
}
