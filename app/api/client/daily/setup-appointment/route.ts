import { NextResponse } from "next/server";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { createDailySetupEvent, deleteDailySetupEvent, getDailySetupSlots, isDailySetupSlotFree } from "@/lib/server/dailySetupCalendar";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

async function authClient() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id || !data.user.email) return null;
  return { id: data.user.id, email: data.user.email.trim().toLowerCase() };
}

export async function GET(req: Request) {
  const client = await authClient();
  if (!client) return NextResponse.json({ error: "Connexion client requise." }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  try {
    const slots = await getDailySetupSlots(date);
    const admin = getAdminSupabase();
    const { data: onboarding } = await admin.from("daily_onboarding").select("manager_first_name,manager_last_name,platform_contact_first_name,platform_contact_last_name,platform_contact_email").eq("user_id", client.id).maybeSingle();
    return NextResponse.json({ slots, profile: { firstName: onboarding?.platform_contact_first_name || onboarding?.manager_first_name || "", lastName: onboarding?.platform_contact_last_name || onboarding?.manager_last_name || "", email: client.email } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Impossible de charger les créneaux." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const client = await authClient();
  if (!client) return NextResponse.json({ error: "Connexion client requise." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const phone = clean(body.phone);
  const message = clean(body.message);
  const startsAt = clean(body.startsAt);
  const endsAt = clean(body.endsAt);
  if (!firstName || !lastName || !phone || !startsAt || !endsAt) return NextResponse.json({ error: "Nom, prénom, téléphone et créneau sont requis." }, { status: 400 });

  try {
    if (!(await isDailySetupSlotFree(startsAt, endsAt))) return NextResponse.json({ error: "Ce créneau n'est plus disponible." }, { status: 409 });
    const event = await createDailySetupEvent({ startsAt, endsAt, firstName, lastName, email: client.email, phone, message });
    const admin = getAdminSupabase();
    const { data, error } = await admin.from("appointment_requests").insert({
      source: "client_space",
      appointment_type: "daily_setup_1h",
      status: "booked",
      first_name: firstName,
      last_name: lastName,
      email: client.email,
      phone,
      message: message || null,
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: event.timezone,
      google_calendar_id: event.calendarId,
      google_event_id: event.eventId,
      client_id: client.id,
      booking_group_id: crypto.randomUUID(),
      slot_index: 1,
      metadata: {
        appointment_label: "Paramétrage Selen Daily - 1 h",
        booking_kind: "daily_setup",
        google_meet_link: event.meetUrl ?? null,
        google_event_link: event.eventUrl ?? null,
        source_flow: "daily_onboarding_accompanied",
      },
    }).select("id").single();
    if (error || !data) {
      await deleteDailySetupEvent(event.eventId);
      return NextResponse.json({ error: error?.message ?? "Enregistrement du rendez-vous impossible." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, appointmentId: data.id, meetUrl: event.meetUrl ?? null });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Réservation impossible." }, { status: 500 });
  }
}
