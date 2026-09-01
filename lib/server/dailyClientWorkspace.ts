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

async function hasActivePersonalDailySubscription(userId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("daily_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function organisationHasActiveDailySubscription(organisationId: string) {
  const admin = getAdminSupabase();
  const { data: memberships, error: membershipError } = await admin
    .from("organisation_memberships")
    .select("user_id")
    .eq("organisation_id", organisationId)
    .eq("status", "active");
  if (membershipError) throw new Error(membershipError.message);

  const userIds = (memberships ?? []).map((membership) => membership.user_id).filter(Boolean);
  if (userIds.length === 0) return false;

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("daily_subscriptions")
    .select("id")
    .in("user_id", userIds)
    .eq("status", "active")
    .limit(1);
  if (subscriptionError) throw new Error(subscriptionError.message);
  return Boolean(subscriptions?.length);
}

async function linkPurchasedDailyOrganisation({
  userId,
  userEmail,
  organisationName,
  siret,
  address,
  managerName,
}: {
  userId: string;
  userEmail: string | null | undefined;
  organisationName: string;
  siret: string | null;
  address: string | null;
  managerName: string | null;
}) {
  const admin = getAdminSupabase();
  const cleanEmail = userEmail?.trim().toLowerCase() ?? "";
  if (!cleanEmail) return false;

  const { data: organisations, error: organisationError } = await admin
    .from("organisations")
    .select("id")
    .ilike("email", cleanEmail)
    .limit(3);
  if (organisationError) throw new Error(organisationError.message);
  const organisationIds = (organisations ?? []).map((row) => row.id).filter(Boolean);
  if (organisationIds.length === 0) return false;

  const { data: dailyDossiers, error: dossierError } = await admin
    .from("dossiers")
    .select("organisation_id")
    .in("organisation_id", organisationIds)
    .eq("type", "daily")
    .neq("status", "archived");
  if (dossierError) throw new Error(dossierError.message);

  const purchasedOrganisationIds = [
    ...new Set((dailyDossiers ?? []).map((row) => row.organisation_id).filter(Boolean)),
  ];
  if (purchasedOrganisationIds.length === 0) return false;
  if (purchasedOrganisationIds.length > 1) {
    throw new Error(
      "Plusieurs organismes Daily correspondent à ce compte. Selen doit vérifier le rattachement avant de continuer.",
    );
  }

  const organisationId = purchasedOrganisationIds[0];
  const { data: existingMembership, error: existingMembershipError } = await admin
    .from("organisation_memberships")
    .select("id,status")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingMembershipError) throw new Error(existingMembershipError.message);
  if (existingMembership && existingMembership.status !== "active") {
    throw new Error(
      "Votre rattachement à cet organisme existe mais n'est pas actif. Selen doit le vérifier avant de continuer.",
    );
  }

  let membershipId = existingMembership?.id ?? null;
  if (!membershipId) {
    const { data: membership, error: membershipError } = await admin
      .from("organisation_memberships")
      .insert({
        organisation_id: organisationId,
        user_id: userId,
        status: "active",
        primary_role: "manager",
        joined_at: new Date().toISOString(),
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();
    if (membershipError || !membership?.id) {
      throw new Error(membershipError?.message || "Rattachement Daily impossible.");
    }
    membershipId = membership.id;
  }

  const { error: roleError } = await admin
    .from("organisation_membership_roles")
    .upsert(
      { membership_id: membershipId, role: "manager", created_by: userId },
      { onConflict: "membership_id,role" },
    );
  if (roleError) throw new Error(roleError.message);

  const permissionBlocks = ["users", "trainers", "legal_profile", "permanent_documents"];
  const { error: permissionError } = await admin
    .from("organisation_membership_permission_blocks")
    .upsert(
      permissionBlocks.map((permissionBlock) => ({
        membership_id: membershipId,
        permission_block: permissionBlock,
        enabled: true,
        granted_by: userId,
        granted_at: new Date().toISOString(),
        revoked_at: null,
        reason: "Rattachement automatique après souscription Selen Daily",
      })),
      { onConflict: "membership_id,permission_block" },
    );
  if (permissionError) throw new Error(permissionError.message);

  const { error: profileError } = await admin
    .from("organisations")
    .update({
      name: organisationName,
      legal_name: organisationName,
      siret: siret || null,
      email: cleanEmail,
      administrative_email: cleanEmail,
      address: address || null,
      administrative_address: address || null,
      contact_name: managerName || null,
    })
    .eq("id", organisationId);
  if (profileError) throw new Error(profileError.message);

  return true;
}

async function bootstrapFromCompletedOnboarding(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  userEmail: string | null | undefined,
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

  const managerName = [onboarding.manager_first_name, onboarding.manager_last_name]
    .filter(Boolean)
    .join(" ") || null;
  const linkedPurchasedOrganisation = await linkPurchasedDailyOrganisation({
    userId,
    userEmail,
    organisationName: onboarding.organisation_name,
    siret: onboarding.siret || null,
    address: onboarding.address || null,
    managerName,
  });

  if (!linkedPurchasedOrganisation) {
    const { error: bootstrapError } = await supabase.rpc("daily_client_bootstrap_organisation", {
      p_name: onboarding.organisation_name,
      p_siret: onboarding.siret || null,
      p_address: onboarding.address || null,
      p_manager_name: managerName,
    });
    if (bootstrapError) throw new Error(bootstrapError.message);
  }

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
      const hasSubscription = await hasActivePersonalDailySubscription(auth.user.id);
      if (!hasSubscription) {
        return {
          ok: false as const,
          status: 403,
          error: "Aucun abonnement Selen Daily actif n'est associé à ce compte.",
        };
      }
      await bootstrapFromCompletedOnboarding(auth.supabase, auth.user.id, auth.user.email);
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

  const workspace = data as DailyWorkspace;
  try {
    const organisationHasSubscription = await organisationHasActiveDailySubscription(workspace.membership.organisation_id);
    if (!organisationHasSubscription) {
      return {
        ok: false as const,
        status: 403,
        error: "Aucun abonnement Selen Daily actif n'est associé à cet organisme.",
      };
    }
  } catch (subscriptionError) {
    return {
      ok: false as const,
      status: 500,
      error: subscriptionError instanceof Error ? subscriptionError.message : "Vérification de l'abonnement Daily impossible.",
    };
  }

  return {
    ok: true as const,
    supabase: auth.supabase,
    user: auth.user,
    workspace,
  };
}
