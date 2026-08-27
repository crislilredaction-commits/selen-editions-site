import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

async function findSubscription(organisationId: string) {
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
  const { data, error: subscriptionError } = await admin
    .from("daily_subscriptions")
    .select("id,user_id,status,stripe_customer_id,stripe_subscription_id")
    .in("user_id", userIds)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (subscriptionError) throw subscriptionError;
  return data?.[0] ?? null;
}

export async function POST(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.legal_profile) {
    return NextResponse.json({ error: "Seul un responsable autorisé peut gérer l’abonnement." }, { status: 403 });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Le portail de facturation Stripe n’est pas configuré." }, { status: 503 });

  try {
    const subscription = await findSubscription(context.workspace.membership.organisation_id);
    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "Aucun compte de facturation Stripe n’est encore rattaché à cet abonnement." }, { status: 409 });
    }
    const stripe = new Stripe(secret);
    const origin = new URL(req.url).origin;
    const portal = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${origin}/client/daily/mon-compte`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Portail de facturation indisponible." }, { status: 500 });
  }
}
