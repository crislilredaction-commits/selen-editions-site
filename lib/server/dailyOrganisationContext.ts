import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getAssistedClientUser } from "@/lib/server/agentAssistance";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

type DailyCapability = "trainings" | "sessions";

export async function getDailyOrganisationContext(
  req: Request,
  capability: DailyCapability,
  options: { allowAssistanceRead?: boolean } = {},
) {
  const admin = getAdminSupabase();

  if (options.allowAssistanceRead) {
    const assisted = await getAssistedClientUser(admin, req);
    if (assisted) {
      return {
        ok: true as const,
        admin,
        user: assisted.user,
        organisationId: assisted.assistance.organisation_id,
        assisted: true as const,
      };
    }
  }

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
  };
}
