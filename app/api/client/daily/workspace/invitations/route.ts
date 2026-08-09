import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { sendDailyOrganisationInvitation } from "@/lib/server/dailyInvitationEmails";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function cleanArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item)).filter(Boolean) : [];
}
function tokenPair() {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}
function invitationUrl(raw: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://selen-editions.fr").replace(/\/$/, "");
  return `${base}/client/daily/invitation?token=${encodeURIComponent(raw)}`;
}

export async function POST(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.users) {
    return NextResponse.json({ error: "Vous n’avez pas la permission de gérer les utilisateurs." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action) || "create";
  const organisationId = context.workspace.membership.organisation_id;
  const organisationName = String(context.workspace.organisation.name || "votre organisme");

  if (action === "create") {
    const email = clean(body.email).toLowerCase();
    const roles = cleanArray(body.roles);
    const permissionBlocks = cleanArray(body.permission_blocks);
    if (!email || !email.includes("@")) return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 });
    if (roles.length === 0) return NextResponse.json({ error: "Choisissez au moins un rôle." }, { status: 400 });
    const { raw, hash } = tokenPair();
    const { data: invitationId, error } = await context.supabase.rpc("daily_create_organisation_invitation", {
      p_organisation_id: organisationId,
      p_invited_email: email,
      p_intended_roles: roles,
      p_intended_permission_blocks: permissionBlocks,
      p_token_hash: hash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const mail = await sendDailyOrganisationInvitation({
      email,
      organisationName,
      invitationUrl: invitationUrl(raw),
      roles,
    });
    return NextResponse.json({ invitationId, sent: mail.sent, warning: mail.sent ? null : "Invitation créée, mais l’email n’a pas pu être envoyé." });
  }

  const invitationId = clean(body.invitation_id);
  const invitation = context.workspace.invitations.find((item) => String(item.id) === invitationId);
  if (!invitation) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  if (action === "resend") {
    const { raw, hash } = tokenPair();
    const { data: newInvitationId, error } = await context.supabase.rpc("daily_resend_organisation_invitation", {
      p_invitation_id: invitationId,
      p_new_token_hash: hash,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const email = String(invitation.invited_email || "");
    const roles = Array.isArray(invitation.intended_roles) ? invitation.intended_roles.map(String) : [];
    const mail = await sendDailyOrganisationInvitation({ email, organisationName, invitationUrl: invitationUrl(raw), roles });
    return NextResponse.json({ invitationId: newInvitationId, sent: mail.sent, warning: mail.sent ? null : "Nouvelle invitation créée, mais l’email n’a pas pu être envoyé." });
  }

  if (action === "revoke") {
    const { error } = await context.supabase.rpc("daily_revoke_organisation_invitation", {
      p_invitation_id: invitationId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action d’invitation inconnue." }, { status: 400 });
}
