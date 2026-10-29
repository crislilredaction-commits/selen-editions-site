import { NextResponse } from "next/server";

import {
  getAssignedAgentId,
  getDossierSnapshot,
} from "@/lib/server/notifications";
import {
  getAdminSupabase,
  verifyClientNdaDossierAccess,
} from "@/lib/server/clientNdaAccess";
import { blockedAgentAssistanceResponse } from "@/lib/server/agentAssistance";

const DEPOSIT_SUBMITTED_MESSAGE =
  "Le client indique avoir déposé son dossier NDA sur la plateforme officielle.";

function isDepositProcedureOpen(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Boolean((value as Record<string, unknown>).ready_for_deposit);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const dossierId = String(body?.dossierId ?? "").trim();

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = getAdminSupabase();
    const access = await verifyClientNdaDossierAccess(supabase, dossierId, req);

    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    if (access.mode === "agent_assistance") {
      return blockedAgentAssistanceResponse();
    }

    const { data: ndaVariables, error: ndaVariablesError } = await supabase
      .from("nda_variables")
      .select("nda_phase_validations")
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (ndaVariablesError) {
      return NextResponse.json(
        { error: ndaVariablesError.message },
        { status: 500 },
      );
    }

    if (!isDepositProcedureOpen(ndaVariables?.nda_phase_validations)) {
      return NextResponse.json(
        { error: "Ce dossier n'est pas encore prêt pour le dépôt NDA." },
        { status: 409 },
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentMessage, error: recentMessageError } = await supabase
      .from("messages")
      .select("id")
      .eq("dossier_id", dossierId)
      .eq("content", DEPOSIT_SUBMITTED_MESSAGE)
      .gte("created_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (recentMessageError) {
      return NextResponse.json(
        { error: recentMessageError.message },
        { status: 500 },
      );
    }

    let messageId = recentMessage?.id ?? null;

    if (!recentMessage) {
      const { data: message, error: messageError } = await supabase
        .from("messages")
        .insert({
          dossier_id: dossierId,
          sender_type: "system",
          content: DEPOSIT_SUBMITTED_MESSAGE,
          read_by_agent_at: null,
        })
        .select("id")
        .single();

      if (messageError) {
        return NextResponse.json(
          { error: messageError.message },
          { status: 500 },
        );
      }

      messageId = message.id;

      const assignedAgentId = await getAssignedAgentId(supabase, dossierId);
      const snapshot = await getDossierSnapshot(supabase, dossierId);

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert({
          type: "client_submitted_nda_official_deposit",
          title: "Dépôt NDA officiel indiqué",
          content: DEPOSIT_SUBMITTED_MESSAGE,
          dossier_id: dossierId,
          dossier_title: snapshot.dossierTitle,
          organisation_name: snapshot.organisationName,
          link_path: snapshot.linkPath,
          source_message_id: messageId,
          target_role: "agent",
          target_user_id: assignedAgentId,
          escalation_at: new Date(
            Date.now() + 72 * 60 * 60 * 1000,
          ).toISOString(),
        });

      if (notificationError) {
        return NextResponse.json(
          { error: notificationError.message },
          { status: 500 },
        );
      }
    }

    const submittedAt = new Date().toISOString();
    const nextDepositStatus = "dreets_pending";

    const { error: trackingUpdateError } = await supabase
      .from("nda_variables")
      .upsert(
        {
          dossier_id: dossierId,
          organisation_id: access.dossier.organisation_id,
          nda_deposit_status: nextDepositStatus,
          nda_deposit_submitted_at: submittedAt,
        },
        { onConflict: "dossier_id" },
      );

    if (trackingUpdateError) {
      return NextResponse.json(
        { error: trackingUpdateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      ndaTracking: {
        nda_deposit_status: nextDepositStatus,
        nda_deposit_submitted_at: submittedAt,
      },
      messageId,
      deduped: Boolean(recentMessage),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
