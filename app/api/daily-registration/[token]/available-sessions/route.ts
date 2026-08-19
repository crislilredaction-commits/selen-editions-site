import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };

type EnrolmentCountRow = {
  session_id: string;
};

function cleanToken(value?: string | null) {
  return String(value ?? "").trim();
}

function todayIsoDate() {
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

  const admin = getAdminSupabase();
  const { data: formation, error: formationError } = await admin
    .from("daily_formations")
    .select("id,organisation_id,title,public_registration_enabled,status")
    .eq("public_registration_token", clean)
    .eq("public_registration_enabled", true)
    .neq("status", "archived")
    .maybeSingle();

  if (formationError) {
    return NextResponse.json({ error: formationError.message }, { status: 500 });
  }
  if (!formation) {
    return NextResponse.json({ error: "Lien introuvable ou expiré." }, { status: 404 });
  }

  const today = todayIsoDate();
  const { data: sessionRows, error: sessionsError } = await admin
    .from("daily_sessions")
    .select("id,start_date,end_date,modality,distance_mode,location_address,max_participants,schedule_blocks")
    .eq("organisation_id", formation.organisation_id)
    .eq("formation_id", formation.id)
    .eq("status", "ready")
    .not("max_participants", "is", null)
    .gte("end_date", today)
    .order("start_date", { ascending: true });

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  const sessions = sessionRows ?? [];
  if (sessions.length === 0) {
    return NextResponse.json({ formation: { id: formation.id, title: formation.title }, sessions: [] });
  }

  const sessionIds = sessions.map((session) => session.id);
  const { data: enrolments, error: enrolmentsError } = await admin
    .from("daily_session_enrolments")
    .select("session_id")
    .in("session_id", sessionIds)
    .in("status", ["invited", "pending", "confirmed"]);

  if (enrolmentsError) {
    return NextResponse.json({ error: enrolmentsError.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of (enrolments ?? []) as EnrolmentCountRow[]) {
    counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
  }

  const availableSessions = sessions.flatMap((session) => {
    const capacity = Number(session.max_participants ?? 0);
    const occupied = counts.get(session.id) ?? 0;
    const placesRemaining = Math.max(0, capacity - occupied);
    if (capacity <= 0 || placesRemaining <= 0) return [];

    return [{
      id: session.id,
      startDate: session.start_date,
      endDate: session.end_date,
      modality: session.modality,
      distanceMode: session.distance_mode,
      locationAddress: session.location_address,
      scheduleBlocks: session.schedule_blocks,
      maxParticipants: capacity,
      placesRemaining,
    }];
  });

  return NextResponse.json({
    formation: { id: formation.id, title: formation.title },
    sessions: availableSessions,
  });
}
