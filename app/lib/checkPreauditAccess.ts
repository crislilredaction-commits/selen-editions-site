import type { SupabaseClient } from "@supabase/supabase-js";

type AccessCheckResult =
  | {
      ok: true;
      accessExpiresAt: string;
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
    .from("client_tool_access")
    .select("status, access_expires_at")
    .eq("tool_key", "preaudit_qualiopi")
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

  const expiresAt = new Date(accessData.access_expires_at);
  const now = new Date();

  if (accessData.status !== "active" || expiresAt <= now) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  return {
    ok: true,
    accessExpiresAt: accessData.access_expires_at,
  };
}
