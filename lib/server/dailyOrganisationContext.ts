import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getAssistedClientUser } from "@/lib/server/agentAssistance";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

type DailyCapability = "trainings" | "sessions";

async function getAssistedContext(req: Request) {
  const admin = getAdminSupabase();
  const assisted = await getAssistedClientUser(admin, req);
  if (!assisted) return null;
  return {
    ok: true as const,
    admin,
    user: assisted.user,
    organisationId: assisted.assistance.organisation_id,
    assisted: true as const,
    assistance: assisted.assistance,
    capabilities: null,
  };
}

export async function getDailyOrganisationContext(
  req: Request,
  capability: DailyCapability,
  options: { allowAssistanceRead?: boolean } = {},
) {
  if (options.allowAssistanceRead) {
    const assisted = await getAssistedContext(req);
    if (assisted) return assisted;
  }

  const admin = getAdminSupabase();
  const workspace = await getDailyClientWorkspace();
  if (!workspace.ok) return workspace;
  if (!workspace.workspace.capabilities[capability]) {
    return {
      ok: false as const,
      status: 403,
      error: capability === "trainings"
        ? "Vous n’avez pas la permission de gérer les formations."
        : "Vous n’avez pas la permission de gérer les sessions.",
    };
  }

  return {
    ok: true as const,
    admin,
    user: workspace.user,
    organisationId: workspace.workspace.membership.organisation_id,
    assisted: false as const,
    assistance: null,
    capabilities: workspace.workspace.capabilities,
  };
}

export async function getDailyOrganisationReadContext(
  req: Request,
  acceptedCapabilities: DailyCapability[],
) {
  const assisted = await getAssistedContext(req);
  if (assisted) return assisted;

  const admin = getAdminSupabase();
  const workspace = await getDailyClientWorkspace();
  if (!workspace.ok) return workspace;
  if (!acceptedCapabilities.some((capability) => workspace.workspace.capabilities[capability])) {
    return {
      ok: false as const,
      status: 403,
      error: "Vous n’avez pas accès à cet espace Daily.",
    };
  }

  return {
    ok: true as const,
    admin,
    user: workspace.user,
    organisationId: workspace.workspace.membership.organisation_id,
    assisted: false as const,
    assistance: null,
    capabilities: workspace.workspace.capabilities,
  };
}

export async function getDailyOrganisationBillingUserId(
  organisationId: string,
  fallbackUserId: string,
) {
  const admin = getAdminSupabase();
  const { data: memberships, error: membershipError } = await admin
    .from("organisation_memberships")
    .select("user_id,joined_at")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (membershipError) throw new Error(membershipError.message);
  const userIds = (memberships ?? []).map((item) => item.user_id).filter(Boolean);
  if (userIds.length === 0) return fallbackUserId;

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("daily_subscriptions")
    .select("user_id,created_at")
    .in("user_id", userIds)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (subscriptionError) throw new Error(subscriptionError.message);
  return subscriptions?.[0]?.user_id || fallbackUserId;
}
