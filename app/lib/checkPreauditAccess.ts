import type { SupabaseClient } from "@supabase/supabase-js";

type AccessCheckResult =
  | {
      ok: true;
      accessExpiresAt: string | null;
      accessType: string;
    }
  | {
      ok: false;
      reason: "not_logged_in" | "no_access" | "expired" | "error";
      message?: string;
    };

export async function checkPreauditAccess(
  supabase: SupabaseClient,
): Promise<AccessCheckResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    return {
      ok: false,
      reason: "error",
      message: authError.message,
    };
  }

  if (!authData.user) {
    return {
      ok: false,
      reason: "not_logged_in",
    };
  }

  const { data: accessData, error: accessError } = await supabase
    .from("selen_client_tool_access")
    .select("status, access_type, starts_at, ends_at")
    .eq("user_id", authData.user.id)
    .eq("tool_slug", "preaudit-qualiopi")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError) {
    return {
      ok: false,
      reason: "error",
      message: accessError.message,
    };
  }

  if (!accessData) {
    return {
      ok: false,
      reason: "no_access",
    };
  }

  if (accessData.status !== "active") {
    return {
      ok: false,
      reason: "expired",
    };
  }

  if (accessData.access_type === "unlimited") {
    return {
      ok: true,
      accessExpiresAt: null,
      accessType: accessData.access_type,
    };
  }

  const now = new Date();
  const startsAt = accessData.starts_at ? new Date(accessData.starts_at) : null;
  const endsAt = accessData.ends_at ? new Date(accessData.ends_at) : null;

  if (!startsAt || !endsAt || startsAt > now || endsAt < now) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  return {
    ok: true,
    accessExpiresAt: accessData.ends_at,
    accessType: accessData.access_type,
  };
}
