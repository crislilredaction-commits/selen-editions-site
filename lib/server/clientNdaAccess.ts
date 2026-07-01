import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type AdminSupabaseClient = SupabaseClient<any>;

export type ClientNdaAccess =
  | {
      ok: true;
      userEmail: string;
      dossier: {
        id: string;
        title: string | null;
        status: string | null;
        type: string | null;
        organisation_id: string | null;
      };
      organisation: {
        id: string;
        email: string | null;
        name?: string | null;
        phone?: string | null;
      } | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  return createSupabaseAdmin<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export async function verifyClientNdaDossierAccess(
  supabase: AdminSupabaseClient,
  dossierId: string,
): Promise<ClientNdaAccess> {
  const authSupabase = await createServerSupabaseClient();
  const { data: authData, error: authError } =
    await authSupabase.auth.getUser();

  const userEmail = normalizeEmail(authData.user?.email);

  if (authError || !authData.user || !userEmail) {
    return {
      ok: false,
      status: 401,
      error: "Connexion client requise.",
    };
  }

  const { data: dossier, error: dossierError } = await supabase
    .from("dossiers")
    .select("id, title, status, type, organisation_id")
    .eq("id", dossierId)
    .maybeSingle();

  if (dossierError) {
    return {
      ok: false,
      status: 500,
      error: dossierError.message,
    };
  }

  if (!dossier) {
    return {
      ok: false,
      status: 404,
      error: "Dossier introuvable.",
    };
  }

  if (dossier.type && dossier.type !== "nda") {
    return {
      ok: false,
      status: 403,
      error: "Ce dossier n'est pas un parcours NDA client.",
    };
  }

  if (!dossier.organisation_id) {
    return {
      ok: false,
      status: 403,
      error: "Ce dossier n'est pas rattaché à une organisation client.",
    };
  }

  const { data: organisation, error: organisationError } = await supabase
    .from("organisations")
    .select("id, email, name, phone")
    .eq("id", dossier.organisation_id)
    .maybeSingle();

  if (organisationError) {
    return {
      ok: false,
      status: 500,
      error: organisationError.message,
    };
  }

  if (!organisation || normalizeEmail(organisation.email) !== userEmail) {
    return {
      ok: false,
      status: 403,
      error: "Vous n'êtes pas autorisé à consulter ce dossier.",
    };
  }

  return {
    ok: true,
    userEmail,
    dossier,
    organisation,
  };
}

export async function listClientNdaDossiers(supabase: AdminSupabaseClient) {
  const authSupabase = await createServerSupabaseClient();
  const { data: authData, error: authError } =
    await authSupabase.auth.getUser();

  const userEmail = normalizeEmail(authData.user?.email);

  if (authError || !authData.user || !userEmail) {
    return {
      ok: false as const,
      status: 401,
      error: "Connexion client requise.",
    };
  }

  const { data: organisations, error: organisationsError } = await supabase
    .from("organisations")
    .select("id, name, email")
    .ilike("email", userEmail);

  if (organisationsError) {
    return {
      ok: false as const,
      status: 500,
      error: organisationsError.message,
    };
  }

  const organisationIds = (organisations ?? []).map((organisation) =>
    String(organisation.id),
  );

  if (organisationIds.length === 0) {
    return {
      ok: true as const,
      dossiers: [],
    };
  }

  const { data: dossiers, error: dossiersError } = await supabase
    .from("dossiers")
    .select("id, title, status, organisation_id, created_at, updated_at")
    .eq("type", "nda")
    .in("organisation_id", organisationIds)
    .order("created_at", { ascending: false });

  if (dossiersError) {
    return {
      ok: false as const,
      status: 500,
      error: dossiersError.message,
    };
  }

  return {
    ok: true as const,
    dossiers: dossiers ?? [],
  };
}
