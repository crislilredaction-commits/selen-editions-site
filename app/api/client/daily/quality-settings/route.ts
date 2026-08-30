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
    .select("qualiopi_status,qualiopi_valid_from,qualiopi_valid_until,qualiopi_surveillance_audit_date,qualiopi_surveillance_window_start,qualiopi_surveillance_window_end,qualiopi_renewal_reminder_on")
    .eq("id", organisationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Organisme Daily introuvable.");
  const status = String(data.qualiopi_status ?? "unknown").toLowerCase();
  return {
    status,
    required: status === "certified",
    validFrom: data.qualiopi_valid_from ?? null,
    validUntil: data.qualiopi_valid_until ?? null,
    surveillanceAuditDate: data.qualiopi_surveillance_audit_date ?? null,
    surveillanceWindowStart: data.qualiopi_surveillance_window_start ?? null,
    surveillanceWindowEnd: data.qualiopi_surveillance_window_end ?? null,
    renewalReminderOn: data.qualiopi_renewal_reminder_on ?? null,
  };
}

function payload(qualiopi: Awaited<ReturnType<typeof readCanonicalQualiopi>>, enabled: boolean) {
  return {
    required: qualiopi.required,
    enabled,
    qualiopiStatus: qualiopi.status,
    qualiopiValidFrom: qualiopi.validFrom,
    qualiopiValidUntil: qualiopi.validUntil,
    qualiopiSurveillanceAuditDate: qualiopi.surveillanceAuditDate,
    qualiopiSurveillanceWindowStart: qualiopi.surveillanceWindowStart,
    qualiopiSurveillanceWindowEnd: qualiopi.surveillanceWindowEnd,
    qualiopiRenewalReminderOn: qualiopi.renewalReminderOn,
  };
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
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
    return NextResponse.json(payload(qualiopi, qualiopi.required || data?.quality_tracking_enabled !== false));
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

    if (Object.prototype.hasOwnProperty.call(body, "auditDate")) {
      if (!qualiopi.required) return NextResponse.json({ error: "Cet organisme n’est pas actuellement certifié Qualiopi." }, { status: 400 });
      const auditDate = String(body.auditDate ?? "").trim();
      if (!validIsoDate(auditDate)) return NextResponse.json({ error: "Date d’audit invalide." }, { status: 400 });
      if (qualiopi.surveillanceWindowStart && auditDate < qualiopi.surveillanceWindowStart) {
        return NextResponse.json({ error: "La date d’audit est antérieure à la fenêtre de surveillance Qualiopi." }, { status: 400 });
      }
      if (qualiopi.surveillanceWindowEnd && auditDate > qualiopi.surveillanceWindowEnd) {
        return NextResponse.json({ error: "La date d’audit dépasse la fenêtre de surveillance Qualiopi." }, { status: 400 });
      }

      const admin = getAdminSupabase();
      const { error: organisationError } = await admin
        .from("organisations")
        .update({ qualiopi_surveillance_audit_date: auditDate })
        .eq("id", organisationId);
      if (organisationError) throw organisationError;

      const { data: activeTask, error: taskReadError } = await admin
        .from("daily_quality_actions")
        .select("id,status,created_at")
        .eq("organisation_id", organisationId)
        .eq("source_type", "qualiopi_preaudit")
        .eq("source_id", organisationId)
        .in("status", ["open", "planned"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (taskReadError) throw taskReadError;

      const taskValues = {
        title: "Pré-audit Qualiopi à préparer",
        observation: `Audit de surveillance prévu le ${auditDate}. Préparer le pré-audit Selen avant cette échéance.`,
        proposed_solution: "Réaliser le pré-audit et consigner les points à sécuriser avant l’audit de surveillance.",
      };
      if (activeTask) {
        const { error: updateError } = await admin.from("daily_quality_actions").update(taskValues).eq("id", activeTask.id).eq("organisation_id", organisationId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await admin.from("daily_quality_actions").insert({
          organisation_id: organisationId,
          category: "corrective_action",
          source_type: "qualiopi_preaudit",
          source_id: organisationId,
          status: "open",
          ...taskValues,
        });
        if (insertError) throw insertError;
      }

      const refreshed = await readCanonicalQualiopi(organisationId);
      return NextResponse.json(payload(refreshed, true));
    }

    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Valeur de suivi qualité invalide." }, { status: 400 });
    }
    const enabled = qualiopi.required ? true : body.enabled;
    const { error } = await getAdminSupabase()
      .from("daily_onboarding")
      .update({ quality_tracking_enabled: enabled })
      .eq("user_id", billingUserId);
    if (error) throw error;
    return NextResponse.json(payload(qualiopi, enabled));
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Modification impossible." }, { status: 500 });
  }
}
