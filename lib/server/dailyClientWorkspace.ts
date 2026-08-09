import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

export type DailyWorkspace = {
  organisation: Record<string, unknown>;
  membership: {
    id: string;
    organisation_id: string;
    status: string;
    primary_role: string | null;
    roles: string[];
    permission_blocks: string[];
  };
  capabilities: {
    users: boolean;
    trainers: boolean;
    trainers_all?: boolean;
    trainer_self?: boolean;
    legal_profile: boolean;
    permanent_documents: boolean;
    trainings: boolean;
    sessions: boolean;
  };
  users: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  trainers: Array<Record<string, unknown>>;
  profile_change_requests: Array<Record<string, unknown>>;
};

export async function requireDailyClient() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    return { ok: false as const, status: 401, error: "Connexion client requise." };
  }
  return { ok: true as const, supabase, user: data.user };
}

async function bootstrapFromCompletedOnboarding(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
) {
  const admin = getAdminSupabase();
  const { data: onboarding, error } = await admin
    .from("daily_onboarding")
    .select("organisation_name,siret,address,manager_first_name,manager_last_name,status")
    .eq("user_id", userId)
    .eq("status", "completed")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!onboarding?.organisation_name) {
    throw new Error("Terminez d’abord l’onboarding Selen Daily pour créer votre organisme.");
  }

  const { error: bootstrapError } = await supabase.rpc("daily_client_bootstrap_organisation", {
    p_name: onboarding.organisation_name,
    p_siret: onboarding.siret || null,
    p_address: onboarding.address || null,
    p_manager_name: [onboarding.manager_first_name, onboarding.manager_last_name].filter(Boolean).join(" ") || null,
  });
  if (bootstrapError) throw new Error(bootstrapError.message);

  // One-time compatibility bridge: copy any trainer captured by the legacy onboarding
  // into the organisation-scoped trainer model. New Daily management uses daily_trainer_profiles.
  const { data: workspaceData, error: workspaceError } = await supabase.rpc("daily_client_workspace", {
    p_organisation_id: null,
  });
  if (workspaceError) throw new Error(workspaceError.message);
  const workspace = workspaceData as DailyWorkspace;

  const { data: oldTrainers, error: oldTrainerError } = await admin
    .from("daily_trainers")
    .select("first_name,last_name,email")
    .eq("user_id", userId);
  if (oldTrainerError) throw new Error(oldTrainerError.message);

  for (const trainer of oldTrainers ?? []) {
    const displayName = [trainer.first_name, trainer.last_name].filter(Boolean).join(" ") || trainer.email || "Formateur";
    const email = trainer.email?.trim().toLowerCase() || null;
    const existing = workspace.trainers.find((row) =>
      email && String(row.professional_email ?? "").toLowerCase() === email,
    );
    if (existing) continue;

    const { error: insertError } = await admin.from("daily_trainer_profiles").insert({
      organisation_id: workspace.membership.organisation_id,
      professional_email: email,
      display_name: displayName,
      status: "draft",
      engagement_type: "external",
    });
    if (insertError && insertError.code !== "23505") throw new Error(insertError.message);
  }
}

export async function getDailyClientWorkspace() {
  const auth = await requireDailyClient();
  if (!auth.ok) return auth;

  let { data, error } = await auth.supabase.rpc("daily_client_workspace", {
    p_organisation_id: null,
  });

  if (error && error.message.includes("active organisation membership required")) {
    try {
      await bootstrapFromCompletedOnboarding(auth.supabase, auth.user.id);
      const retry = await auth.supabase.rpc("daily_client_workspace", {
        p_organisation_id: null,
      });
      data = retry.data;
      error = retry.error;
    } catch (bootstrapError) {
      return {
        ok: false as const,
        status: 409,
        error: bootstrapError instanceof Error ? bootstrapError.message : "Création de l’organisme impossible.",
      };
    }
  }

  if (error) return { ok: false as const, status: 403, error: error.message };

  return {
    ok: true as const,
    supabase: auth.supabase,
    user: auth.user,
    workspace: data as DailyWorkspace,
  };
}
