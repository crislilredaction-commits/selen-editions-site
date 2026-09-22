import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const AGENT_ASSISTANCE_BLOCKED_MESSAGE =
  "Cette action doit être réalisée par le client depuis son propre accès.";

export type AgentAssistanceContext = {
  id: string;
  agent_user_id: string | null;
  agent_email: string | null;
  organisation_id: string;
  dossier_id: string | null;
  expires_at: string;
};

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getAssistanceTokenFromRequest(req: Request) {
  const url = new URL(req.url);
  return (
    url.searchParams.get("assistanceToken")?.trim() ||
    req.headers.get("x-selen-agent-assistance")?.trim() ||
    ""
  );
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function verifyAgentAssistance(
  supabase: SupabaseClient,
  token: string,
  options: { dossierId?: string | null } = {},
) {
  if (!token) return null;

  const { data, error } = await supabase
    .from("selen_agent_assistance_tokens")
    .select(
      "id, agent_user_id, agent_email, organisation_id, dossier_id, status, expires_at",
    )
    .eq("token_hash", hashToken(token))
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const context = data as AgentAssistanceContext & { status: string };

  // A still-valid token is not enough: the Studio actor must still be active.
  const normalizedEmail = context.agent_email?.trim().toLowerCase() ?? null;
  const profileQuery = supabase
    .from("agent_profiles")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  const [{ data: agentProfile }, { data: adminUser }] = await Promise.all([
    context.agent_user_id
      ? normalizedEmail
        ? profileQuery
            .or(`user_id.eq.${context.agent_user_id},email.eq.${normalizedEmail}`)
            .maybeSingle()
        : profileQuery.eq("user_id", context.agent_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    normalizedEmail
      ? supabase
          .from("selen_admin_users")
          .select("email")
          .eq("email", normalizedEmail)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!agentProfile && !adminUser) return null;

  if (
    options.dossierId &&
    context.dossier_id &&
    context.dossier_id !== options.dossierId
  ) {
    return null;
  }

  await supabase
    .from("selen_agent_assistance_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", context.id);

  return context;
}

export async function logAgentAssistanceAction({
  supabase,
  req,
  assistance,
  action,
  actionLabel,
  dossierId,
  oldState = null,
  newState = null,
  metadata = {},
}: {
  supabase: SupabaseClient;
  req: Request;
  assistance: AgentAssistanceContext;
  action: string;
  actionLabel?: string;
  dossierId?: string | null;
  oldState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("selen_agent_assistance_logs").insert({
    assistance_token_id: assistance.id,
    agent_user_id: assistance.agent_user_id,
    agent_email: assistance.agent_email,
    organisation_id: assistance.organisation_id,
    dossier_id: dossierId ?? assistance.dossier_id,
    action,
    action_label: actionLabel ?? action,
    old_state: oldState,
    new_state: newState,
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    metadata: {
      ...metadata,
      mode: "agent_assistance",
      notice: "action réalisée en mode assistance agent",
    },
  });
}

export async function getAssistedClientUser(
  supabase: SupabaseClient,
  req: Request,
) {
  const assistance = await verifyAgentAssistance(
    supabase,
    getAssistanceTokenFromRequest(req),
  );

  if (!assistance) return null;

  const { data: organisation } = await supabase
    .from("organisations")
    .select("email")
    .eq("id", assistance.organisation_id)
    .maybeSingle();

  const email = String(organisation?.email ?? "").trim().toLowerCase();
  if (!email) return null;

  let page = 1;
  const perPage = 1000;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) return null;

    const user = data.users.find(
      (item) => item.email?.trim().toLowerCase() === email,
    );

    if (user) {
      return {
        assistance,
        user: {
          id: user.id,
          email: user.email ?? email,
        },
      };
    }

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

export function blockedAgentAssistanceResponse() {
  return Response.json(
    { error: AGENT_ASSISTANCE_BLOCKED_MESSAGE, assistanceBlocked: true },
    { status: 403 },
  );
}
