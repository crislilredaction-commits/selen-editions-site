import type { SupabaseClient } from "@supabase/supabase-js";

const PREAUDIT_SESSION_STORAGE_KEY = "preaudit_session_id";

type PreauditSessionRpcRow = {
  session_id?: string | null;
};

export function clearStoredPreauditSessionId() {
  localStorage.removeItem(PREAUDIT_SESSION_STORAGE_KEY);
}

export async function getOrResumePreauditSessionId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase.rpc("start_or_resume_preaudit_session");

  if (error) {
    throw new Error(
      `Impossible de demarrer le preaudit. ${error.message ?? ""}`.trim(),
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | PreauditSessionRpcRow
    | null
    | undefined;

  const sessionId = row?.session_id;

  if (!sessionId) {
    throw new Error("Session preaudit introuvable.");
  }

  localStorage.setItem(PREAUDIT_SESSION_STORAGE_KEY, sessionId);

  return sessionId;
}

export function isPreauditSessionAccessError(error?: {
  message?: string | null;
} | null) {
  const message = (error?.message ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    message.includes("session preaudit introuvable") ||
    message.includes("non autoris")
  );
}
