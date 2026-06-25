import { NextResponse } from "next/server";

import { sendAppointmentCancellationEmail } from "@/lib/server/appointmentEmails";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  APPOINTMENT_TYPE_CONFIG,
  deleteCalendarAppointment,
  normalizeAppointmentType,
} from "@/lib/server/googleCalendar";

type AppointmentRow = {
  id: string;
  source: string | null;
  appointment_type: string | null;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  starts_at: string;
  ends_at: string;
  google_event_id: string | null;
  booking_group_id: string | null;
  dossier_id: string | null;
  slot_index: number | null;
  metadata: Record<string, unknown> | null;
};

function cleanToken(value: string | null) {
  return value?.trim() ?? "";
}

function getBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

function buildReservationUrl(request: Request, row: AppointmentRow) {
  const appointmentType = normalizeAppointmentType(row.appointment_type);
  const source = row.source === "client_space" ? "client_space" : "public_site";
  const token =
    typeof row.metadata?.manage_token === "string"
      ? row.metadata.manage_token
      : "";
  const params = new URLSearchParams({
    source,
    appointmentType,
    rescheduled: "1",
  });

  if (token) {
    params.set("rescheduleToken", token);
  }

  if (row.dossier_id) {
    params.set("dossierId", row.dossier_id);
  }

  return `${getBaseUrl(request)}/prendre-rendez-vous?${params}`;
}

async function fetchAppointmentsByToken(token: string) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("appointment_requests")
    .select(
      "id, source, appointment_type, status, first_name, last_name, email, phone, starts_at, ends_at, google_event_id, booking_group_id, dossier_id, slot_index, metadata",
    )
    .eq("metadata->>manage_token", token)
    .order("slot_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AppointmentRow[];
}

function toPublicPayload(request: Request, rows: AppointmentRow[]) {
  const first = rows[0];
  const appointmentType = normalizeAppointmentType(first.appointment_type);
  const config = APPOINTMENT_TYPE_CONFIG[appointmentType];

  return {
    appointmentType,
    appointmentLabel: config.label,
    bookingKind: config.bookingKind,
    status: rows.every((row) => row.status === "cancelled")
      ? "cancelled"
      : rows.some((row) => row.status === "completed")
        ? "completed"
        : "booked",
    firstName: first.first_name,
    lastName: first.last_name,
    email: first.email,
    canManage: rows.every((row) => row.status === "booked"),
    rescheduleUrl: buildReservationUrl(request, first),
    appointments: rows.map((row) => ({
      id: row.id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      slotIndex: row.slot_index,
      status: row.status,
    })),
  };
}

async function cancelAppointments(request: Request, rows: AppointmentRow[]) {
  const supabase = getAdminSupabase();
  const bookedRows = rows.filter((row) => row.status === "booked");

  if (bookedRows.length === 0) {
    return;
  }

  for (const row of bookedRows) {
    if (!row.google_event_id) continue;
    await deleteCalendarAppointment(row.google_event_id);
  }

  const ids = bookedRows.map((row) => row.id);
  const { error } = await supabase
    .from("appointment_requests")
    .update({ status: "cancelled" })
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const first = bookedRows[0];
  if (first.email && first.first_name) {
    try {
      await sendAppointmentCancellationEmail({
        firstName: first.first_name,
        email: first.email,
        startsAt: first.starts_at,
        rescheduleUrl: buildReservationUrl(request, first),
      });
    } catch (emailError) {
      console.warn("Rendez-vous annule, email d'annulation non envoye :", {
        error:
          emailError instanceof Error ? emailError.message : String(emailError),
      });
    }
  }
}

export async function GET(request: Request) {
  try {
    const token = cleanToken(new URL(request.url).searchParams.get("token"));

    if (!token) {
      return NextResponse.json({ error: "Token manquant." }, { status: 400 });
    }

    const rows = await fetchAppointmentsByToken(token);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Rendez-vous introuvable." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      booking: toPublicPayload(request, rows),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de charger le rendez-vous.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { token?: string; action?: string }
      | null;
    const token = cleanToken(body?.token ?? null);
    const action = body?.action;

    if (!token) {
      return NextResponse.json({ error: "Token manquant." }, { status: 400 });
    }

    if (action !== "cancel" && action !== "reschedule") {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const rows = await fetchAppointmentsByToken(token);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Rendez-vous introuvable." },
        { status: 404 },
      );
    }

    if (!rows.every((row) => row.status === "booked")) {
      return NextResponse.json({
        ok: true,
        booking: toPublicPayload(request, rows),
      });
    }

    if (action === "reschedule") {
      const payload = toPublicPayload(request, rows);

      return NextResponse.json({
        ok: true,
        action,
        booking: payload,
        redirectUrl: payload.rescheduleUrl,
      });
    }

    await cancelAppointments(request, rows);

    const cancelledRows = await fetchAppointmentsByToken(token);
    const payload = toPublicPayload(request, cancelledRows);

    return NextResponse.json({
      ok: true,
      action,
      booking: payload,
      redirectUrl: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de gerer le rendez-vous.",
      },
      { status: 500 },
    );
  }
}
