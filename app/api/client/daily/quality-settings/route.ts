import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

async function resolveBillingUserId(organisationId: string) {
  const admin = getAdminSupabase();
  const { data: memberships, error } = await admin
    .from("organisation_memberships")
    .select("user_id,joined_at")
    .eq("organisation_id", organisationId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const userIds = (memberships ?? []).map((row) => row.user_id).filter(Boolean);
  if (!userIds.length) return null;
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("daily_subscriptions")
    .select("user_id,created_at")
    .in("user_id", userIds)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (subscriptionError) throw subscriptionError;
  return subscriptions?.[0]?.user_id ?? null;
}

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    const billingUserId = await resolveBillingUserId(context.workspace.membership.organisation_id);
    if (!billingUserId) return NextResponse.json({ error: "Abonnement Daily introuvable." }, { status: 404 });
    const { data, error } = await getAdminSupabase()
      .from("daily_onboarding")
      .select("qualiopi_status,quality_tracking_enabled")
      .eq("user_id", billingUserId)
      .maybeSingle();
    if (error) throw error;
    const required = data?.qualiopi_status === "yes";
    return NextResponse.json({ required, enabled: required || data?.quality_tracking_enabled !== false });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Réglage indisponible." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.legal_profile) {
    return NextResponse.json({ error: "Accès au profil de l’organisme requis." }, { status: 403 });
  }
  try {
    const billingUserId = await resolveBillingUserId(context.workspace.membership.organisation_id);
    if (!billingUserId) return NextResponse.json({ error: "Abonnement Daily introuvable." }, { status: 404 });
    const admin = getAdminSupabase();
    const { data: onboarding, error: readError } = await admin
      .from("daily_onboarding")
      .select("qualiopi_status")
      .eq("user_id", billingUserId)
      .maybeSingle();
    if (readError) throw readError;
    const required = onboarding?.qualiopi_status === "yes";
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const enabled = required ? true : body.enabled !== false;
    const { error } = await admin.from("daily_onboarding").update({ quality_tracking_enabled: enabled }).eq("user_id", billingUserId);
    if (error) throw error;
    return NextResponse.json({ required, enabled });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Modification impossible." }, { status: 500 });
  }
}
