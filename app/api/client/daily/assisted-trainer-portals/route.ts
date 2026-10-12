import crypto from "crypto";
import { NextResponse } from "next/server";

import { logAgentAssistanceAction } from "@/lib/server/agentAssistance";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

const CHILD_TOKEN_MINUTES = 15;

type SessionRow = {
  id: string;
  internal_reference: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  daily_formations:
    | { title?: string | null }
    | Array<{ title?: string | null }>
    | null;
};

type PortalRow = {
  id: string;
  session_id: string;
  entity_key: string | null;
  entity_name: string | null;
  entity_email: string | null;
  status: string | null;
  expires_at: string | null;
  viewed_at: string | null;
  updated_at: string | null;
};

function related<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isUsableAccess(access: Pick<PortalRow, "status" | "expires_at">) {
  if (["revoked", "expired"].includes(normalized(access.status))) return false;
  if (!access.expires_at) return true;
  const expiresAt = new Date(access.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function safeSessionLabel(session: SessionRow) {
  const formation = related(session.daily_formations);
  return formation?.title?.trim() || session.internal_reference?.trim() || "Session Daily";
}

function accessIdentity(access: PortalRow) {
  return normalized(access.entity_key) || normalized(access.entity_email) || `access:${access.id}`;
}

function getClientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

async function getAssistedTrainerContext(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["sessions", "trainers"]);
  if (!context.ok) return context;
  if (!context.assisted || !context.assistance) {
    return {
      ok: false as const,
      status: 403,
      error: "Cette sélection est réservée au mode assistance Studio.",
    };
  }
  return context;
}

export async function GET(req: Request) {
  const context = await getAssistedTrainerContext(req);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data: sessionRows, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,internal_reference,start_date,end_date,status,daily_formations(title)")
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .order("start_date", { ascending: false });

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const sessions = (sessionRows ?? []) as SessionRow[];
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({ portals: [] });
  }

  const { data: portalRows, error: portalError } = await context.admin
    .from("daily_portal_access_tokens")
    .select("id,session_id,entity_key,entity_name,entity_email,status,expires_at,viewed_at,updated_at")
    .in("session_id", sessionIds)
    .eq("portal_type", "trainer")
    .order("updated_at", { ascending: false });

  if (portalError) {
    return NextResponse.json({ error: portalError.message }, { status: 500 });
  }

  // A trainer can legitimately have one access per session. Collapse only
  // repeated active links for the same trainer and the same session.
  const canonical = new Map<string, PortalRow>();
  for (const portal of (portalRows ?? []) as PortalRow[]) {
    if (!isUsableAccess(portal) || !sessionById.has(portal.session_id)) continue;
    const key = `${portal.session_id}:${accessIdentity(portal)}`;
    if (!canonical.has(key)) canonical.set(key, portal);
  }

  const portals = [...canonical.values()].map((portal) => {
    const session = sessionById.get(portal.session_id)!;
    return {
      id: portal.id,
      trainerName: portal.entity_name?.trim() || "Formateur",
      trainerEmail: portal.entity_email?.trim() || null,
      sessionId: session.id,
      sessionLabel: safeSessionLabel(session),
      startDate: session.start_date,
      endDate: session.end_date,
      accessStatus: portal.status,
      lastOpenedAt: portal.viewed_at,
    };
  });

  return NextResponse.json({ portals });
}

export async function POST(req: Request) {
  const context = await getAssistedTrainerContext(req);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const body = await req.json().catch(() => ({}));
  const portalAccessId = String(body.portalAccessId ?? "").trim();
  if (!portalAccessId) {
    return NextResponse.json({ error: "Choisissez un espace formateur." }, { status: 400 });
  }

  const { data: portal, error: portalError } = await context.admin
    .from("daily_portal_access_tokens")
    .select("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at")
    .eq("id", portalAccessId)
    .eq("portal_type", "trainer")
    .maybeSingle();
  if (portalError) {
    return NextResponse.json({ error: portalError.message }, { status: 500 });
  }
  if (!portal || !isUsableAccess(portal)) {
    return NextResponse.json({ error: "Cet espace formateur n’est plus disponible." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await context.admin
    .from("daily_sessions")
    .select("id,organisation_id,status")
    .eq("id", portal.session_id)
    .eq("organisation_id", context.organisationId)
    .neq("status", "archived")
    .maybeSingle();
  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }
  if (!session) {
    return NextResponse.json({ error: "Espace formateur hors de l’organisme assisté." }, { status: 403 });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const parentExpiry = new Date(context.assistance.expires_at).getTime();
  const expiresAt = new Date(
    Math.min(parentExpiry, Date.now() + CHILD_TOKEN_MINUTES * 60 * 1000),
  ).toISOString();

  const { data: child, error: insertError } = await context.admin
    .from("selen_agent_assistance_tokens")
    .insert({
      token_hash: tokenHash,
      agent_user_id: context.assistance.agent_user_id,
      agent_email: context.assistance.agent_email,
      organisation_id: context.organisationId,
      dossier_id: context.assistance.dossier_id,
      expires_at: expiresAt,
      created_ip: getClientIp(req),
      created_user_agent: req.headers.get("user-agent"),
      metadata: {
        scope: "portal_preview",
        portal_access_id: portal.id,
        parent_assistance_token_id: context.assistance.id,
      },
    })
    .select("id")
    .single();

  if (insertError || !child) {
    return NextResponse.json(
      { error: insertError?.message ?? "Impossible d’ouvrir cet espace formateur." },
      { status: 500 },
    );
  }

  await logAgentAssistanceAction({
    supabase: context.admin,
    req,
    assistance: context.assistance,
    action: "delegated_trainer_portal_selected",
    actionLabel: "Espace formateur délégué sélectionné",
    metadata: {
      child_assistance_token_id: child.id,
      portal_access_id: portal.id,
      session_id: session.id,
      trainer_entity_key: portal.entity_key,
    },
  });

  const url = new URL(
    `/daily/assistance/portail/${encodeURIComponent(portal.id)}`,
    new URL(req.url).origin,
  );
  url.searchParams.set("assistanceToken", token);

  return NextResponse.json({ url: `${url.pathname}${url.search}`, expiresAt }, { status: 201 });
}
