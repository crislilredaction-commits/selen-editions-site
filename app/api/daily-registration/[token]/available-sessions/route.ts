import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };

type SessionRow = {
  id: string;
  registration_token: string | null;
  start_date: string | null;
  end_date: string | null;
  modality: string;
  location_address: string | null;
  schedule_blocks: unknown;
  max_participants: number | null;
};

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const clean = cleanToken(token);
  if (!clean) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });

  const supabase = getAdminSupabase();
  const { data: formation, error: formationError } = await supabase
    .from("daily_formations")
    .select("id,organisation_id,title")
    .eq("public_registration_token", clean)
    .eq("public_registration_enabled", true)
    .neq("status", "archived")
    .maybeSingle();

  if (formationError) {
    return NextResponse.json({ error: "Impossible de charger les sessions disponibles." }, { status: 500 });
  }
  if (!formation) {
    return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("daily_sessions")
    .select("id,registration_token,start_date,end_date,modality,location_address,schedule_blocks,max_participants")
    .eq("organisation_id", formation.organisation_id)
    .eq("formation_id", formation.id)
    .eq("status", "ready")
    .gte("start_date", parisDate())
    .order("start_date", { ascending: true });

  if (sessionsError) {
    return NextResponse.json({ error: "Impossible de charger les sessions disponibles." }, { status: 500 });
  }

  const eligibleSessions = ((sessions ?? []) as SessionRow[]).filter(
    (session) => session.registration_token && session.max_participants && session.max_participants > 0,
  );

  if (eligibleSessions.length === 0) {
    return NextResponse.json({ formation: { id: formation.id, title: formation.title }, sessions: [] });
  }

  const sessionIds = eligibleSessions.map((session) => session.id);
  const { data: enrolments, error: enrolmentsError } = await supabase
    .from("daily_session_enrolments")
    .select("session_id,status")
    .eq("organisation_id", formation.organisation_id)
    .in("session_id", sessionIds)
    .in("status", ["invited", "pending", "confirmed"]);

  if (enrolmentsError) {
    return NextResponse.json({ error: "Impossible de vérifier les places disponibles." }, { status: 500 });
  }

  const occupiedBySession = new Map<string, number>();
  for (const enrolment of enrolments ?? []) {
    occupiedBySession.set(
      enrolment.session_id,
      (occupiedBySession.get(enrolment.session_id) ?? 0) + 1,
    );
  }

  const publicSessions = eligibleSessions
    .map((session) => {
      const occupied = occupiedBySession.get(session.id) ?? 0;
      const availablePlaces = Math.max((session.max_participants ?? 0) - occupied, 0);
      return {
        id: session.id,
        registration_token: session.registration_token,
        start_date: session.start_date,
        end_date: session.end_date,
        modality: session.modality,
        location_address: session.location_address,
        schedule_blocks: Array.isArray(session.schedule_blocks) ? session.schedule_blocks : [],
        max_participants: session.max_participants,
        available_places: availablePlaces,
      };
    })
    .filter((session) => session.available_places > 0);

  return NextResponse.json({
    formation: { id: formation.id, title: formation.title },
    sessions: publicSessions,
  });
}
