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

async function readCanonicalQualiopi(organisationId: string) {
  const { data, error } = await getAdminSupabase()
    .from("organisations")
    .select("qualiopi_status,qualiopi_valid_from,qualiopi_valid_until")
    .eq("id", organisationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Organisme Daily introuvable.");
  const status = String(data.qualiopi_status ?? "unknown").toLowerCase();
  return {
    status,
    required: status === "yes" || status === "certified",
    validFrom: data.qualiopi_valid_from ?? null,
    validUntil: data.qualiopi_valid_until ?? null,
  };
}

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  try {
    const organisationId = context.workspace.membership.organisation_id;
    const [billingUserId, qualiopi] = await Promise.all([
      resolveBillingUserId(organisationId),
      readCanonicalQualiopi(organisationId),
    ]);
    if (!billingUserId) return NextResponse.json({ error: "Abonnement Daily introuvable." }, { status: 404 });
    const { data, error } = await getAdminSupabase()
      .from("daily_onboarding")
      .select("quality_tracking_enabled")
      .eq("user_id", billingUserId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      required: qualiopi.required,
      enabled: qualiopi.required || data?.quality_tracking_enabled !== false,
      qualiopiStatus: qualiopi.status,
      qualiopiValidFrom: qualiopi.validFrom,
      qualiopiValidUntil: qualiopi.validUntil,
    });
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
    const organisationId = context.workspace.membership.organisation_id;
    const [billingUserId, qualiopi] = await Promise.all([
      resolveBillingUserId(organisationId),
      readCanonicalQualiopi(organisationId),
    ]);
    if (!billingUserId) return NextResponse.json({ error: "Abonnement Daily introuvable." }, { status: 404 });
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Valeur de suivi qualité invalide." }, { status: 400 });
    }
    const enabled = qualiopi.required ? true : body.enabled;
    const { error } = await getAdminSupabase()
      .from("daily_onboarding")
      .update({ quality_tracking_enabled: enabled })
      .eq("user_id", billingUserId);
    if (error) throw error;
    return NextResponse.json({
      required: qualiopi.required,
      enabled,
      qualiopiStatus: qualiopi.status,
      qualiopiValidFrom: qualiopi.validFrom,
      qualiopiValidUntil: qualiopi.validUntil,
    });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Modification impossible." }, { status: 500 });
  }
}
