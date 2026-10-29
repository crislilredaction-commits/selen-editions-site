import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type DossierConfig = {
  dossierType: string;
  title: string;
  status: string;
};

const TOOL_DOSSIER_CONFIG: Record<string, DossierConfig> = {
  preaudit_qualiopi: {
    dossierType: "preaudit",
    title: "Préaudit Qualiopi",
    status: "assignable",
  },
  audit_blanc_qualiopi: {
    dossierType: "review",
    title: "Selen Review - Audit blanc Qualiopi",
    status: "in_progress",
  },
  prepa_nda: {
    dossierType: "nda",
    title: "Prépa NDA - Déclaration d'activité",
    status: "draft",
  },
};

function addThreeMonths(date: Date) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 3);
  return next;
}

function cleanEmail(email: string) {
  return email.trim().toLowerCase();
}

async function ensureOrganisationForClient(email: string) {
  const supabase = getAdminSupabase();
  const normalizedEmail = cleanEmail(email);

  const { data: existing, error: existingError } = await supabase
    .from("organisations")
    .select("id, name, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("organisations")
    .insert({
      name: normalizedEmail,
      email: normalizedEmail,
      status: "active",
    })
    .select("id, name, email")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Client Studio non créé.");
  }

  return data;
}

async function ensureDossierForClient({
  organisationId,
  toolSlug,
}: {
  organisationId: string;
  toolSlug: keyof typeof TOOL_DOSSIER_CONFIG;
}) {
  const supabase = getAdminSupabase();
  const config = TOOL_DOSSIER_CONFIG[toolSlug];

  const { data: existing, error: existingError } = await supabase
    .from("dossiers")
    .select("id, title, type, status")
    .eq("organisation_id", organisationId)
    .eq("type", config.dossierType)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing;

  const { data, error } = await supabase
    .from("dossiers")
    .insert({
      title: config.title,
      type: config.dossierType,
      organisation_id: organisationId,
      status: config.status,
    })
    .select("id, title, type, status")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Dossier Studio non créé.");
  }

  return data;
}

async function ensureStudioClientAndDossier({
  email,
  toolSlug,
}: {
  email: string;
  toolSlug: keyof typeof TOOL_DOSSIER_CONFIG;
}) {
  const organisation = await ensureOrganisationForClient(email);
  const dossier = await ensureDossierForClient({
    organisationId: organisation.id,
    toolSlug,
  });

  return { organisation, dossier };
}

export async function fulfillFreeAutoAudit({
  email,
  offer,
}: {
  email: string;
  offer: string;
}) {
  const supabase = getAdminSupabase();
  const now = new Date();
  const expiresAt = addThreeMonths(now);
  const normalizedEmail = cleanEmail(email);

  const { error } = await supabase.from("client_tool_access").upsert(
    {
      email: normalizedEmail,
      tool_key: "preaudit_qualiopi",
      status: "active",
      access_starts_at: now.toISOString(),
      access_expires_at: expiresAt.toISOString(),
      stripe_checkout_session_id: `free_${crypto.randomUUID()}`,
      offer,
      amount_paid: 0,
      currency: "eur",
      updated_at: now.toISOString(),
    },
    {
      onConflict: "email,tool_key",
    },
  );

  if (error) throw new Error(error.message);

  await ensureStudioClientAndDossier({
    email: normalizedEmail,
    toolSlug: "preaudit_qualiopi",
  });
}

export async function fulfillFreePrepaNda({ email }: { email: string }) {
  await ensureStudioClientAndDossier({
    email: cleanEmail(email),
    toolSlug: "prepa_nda",
  });
}

export async function fulfillFreeAuditBlanc({
  email,
  offer,
}: {
  email: string;
  offer: string;
}) {
  const supabase = getAdminSupabase();
  const normalizedEmail = cleanEmail(email);
  const { dossier } = await ensureStudioClientAndDossier({
    email: normalizedEmail,
    toolSlug: "audit_blanc_qualiopi",
  });

  const now = new Date().toISOString();
  const { error } = await supabase.from("audit_blanc_cases").insert({
    client_email: normalizedEmail,
    dossier_id: dossier?.id ?? null,
    status: "booking_pending",
    offer,
    price_paid: 0,
    currency: "eur",
    stripe_checkout_session_id: `free_${crypto.randomUUID()}`,
    report_status: "not_started",
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(error.message);
}
