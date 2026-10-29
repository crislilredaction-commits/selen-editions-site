import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

/** Same subscription/email boundary as Studio's dailyOrganisationScope. */
export async function getActiveDailyTaskOrganisationIds(admin = getAdminSupabase()): Promise<string[]> {
  const { data: subscriptions, error } = await admin.from("daily_subscriptions").select("user_id").eq("status", "active");
  if (error) throw new Error("Impossible de vérifier les abonnements Daily.");
  const userIds = [...new Set((subscriptions ?? []).map(row => row.user_id as string).filter(Boolean))];
  if (!userIds.length) return [];
  const users = await Promise.all(userIds.map(id => admin.auth.admin.getUserById(id)));
  if (users.some(result => result.error)) throw new Error("Impossible de vérifier les clients Daily.");
  const emails = new Set(users.map(result => result.data.user?.email?.trim().toLowerCase()).filter(Boolean));
  if (!emails.size) return [];
  const { data: organisations, error: organisationError } = await admin.from("organisations").select("id,email,status").neq("status", "archived");
  if (organisationError) throw new Error("Impossible de vérifier les organismes Daily.");
  return (organisations ?? []).filter(row => emails.has(row.email?.trim().toLowerCase())).map(row => row.id as string);
}
