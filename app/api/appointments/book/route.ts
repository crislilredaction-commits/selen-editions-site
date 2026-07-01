import { NextResponse } from "next/server";

import { sendAppointmentConfirmationEmail } from "@/lib/server/appointmentEmails";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import {
  APPOINTMENT_TYPE_CONFIG,
  createCalendarAppointment,
  deleteCalendarAppointment,
  getAppointmentCalendarPublicConfig,
  isAppointmentSlotFree,
  normalizeAppointmentType,
  type AppointmentType,
} from "@/lib/server/googleCalendar";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type BookingSlotPayload = {
  startsAt?: string;
  endsAt?: string;
};

type BookingPayload = {
  source?: string;
  appointmentType?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  message?: string;
  startsAt?: string;
  endsAt?: string;
  slots?: BookingSlotPayload[];
  dossierId?: string | null;
  rescheduleToken?: string | null;
};

type AuditAccess = {
  clientId: string | null;
  dossierId: string | null;
  auditCaseId: string | null;
};

type AppointmentRow = {
  id: string;
  status: string | null;
  appointment_type: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  google_event_id: string | null;
  booking_group_id: string | null;
  dossier_id: string | null;
  metadata: Record<string, unknown> | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getSource(value: string) {
  return value === "client_space" ? "client_space" : "public_site";
}

function getExpectedSlotCount(appointmentType: AppointmentType) {
  return appointmentType === "audit_2x1h45" ? 2 : 1;
}

function getSlotsFromPayload(payload: BookingPayload) {
  if (Array.isArray(payload.slots) && payload.slots.length > 0) {
    return payload.slots.map((slot) => ({
      startsAt: cleanText(slot.startsAt),
      endsAt: cleanText(slot.endsAt),
    }));
  }

  return [
    {
      startsAt: cleanText(payload.startsAt),
      endsAt: cleanText(payload.endsAt),
    },
  ];
}

function validateSlots(
  slots: Array<{ startsAt: string; endsAt: string }>,
  appointmentType: AppointmentType,
) {
  const expectedCount = getExpectedSlotCount(appointmentType);
  const expectedDurationMs =
    APPOINTMENT_TYPE_CONFIG[appointmentType].durationMinutes * 60_000;

  if (slots.length !== expectedCount) {
    return `Ce type de rendez-vous demande ${expectedCount} creneau(x).`;
  }

  const seenStarts = new Set<string>();

  for (const slot of slots) {
    const startDate = new Date(slot.startsAt);
    const endDate = new Date(slot.endsAt);

    if (
      !slot.startsAt ||
      !slot.endsAt ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate.getTime() - startDate.getTime() !== expectedDurationMs
    ) {
      return "Creneau invalide.";
    }

    if (startDate <= new Date()) {
      return "Ce creneau est deja passe.";
    }

    if (seenStarts.has(slot.startsAt)) {
      return "Les deux creneaux doivent etre distincts.";
    }

    seenStarts.add(slot.startsAt);
  }

  return null;
}

function buildAppointmentMetadata({
  appointmentType,
  totalSlots,
  manageToken,
  cancelUrl,
  rescheduleUrl,
  googleEventLink,
  googleMeetLink,
}: {
  appointmentType: AppointmentType;
  totalSlots: number;
  manageToken?: string;
  cancelUrl?: string;
  rescheduleUrl?: string;
  googleEventLink?: string;
  googleMeetLink?: string;
}) {
  const config = APPOINTMENT_TYPE_CONFIG[appointmentType];

  return {
    appointment_label: config.label,
    booking_kind: config.bookingKind,
    total_slots: totalSlots,
    ...(manageToken ? { manage_token: manageToken } : {}),
    ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
    ...(rescheduleUrl ? { reschedule_url: rescheduleUrl } : {}),
    ...(googleMeetLink ? { google_meet_link: googleMeetLink } : {}),
    ...(googleEventLink ? { google_event_link: googleEventLink } : {}),
  };
}

function createManageToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function getBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    new URL(request.url).origin
  );
}

async function fetchBookedAppointmentsByManageToken({
  supabase,
  token,
}: {
  supabase: ReturnType<typeof getAdminSupabase>;
  token: string;
}) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select(
      "id, status, appointment_type, first_name, last_name, email, phone, google_event_id, booking_group_id, dossier_id, metadata",
    )
    .eq("metadata->>manage_token", token)
    .order("slot_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as AppointmentRow[];

  if (rows.length === 0) {
    throw new Error("Rendez-vous a deplacer introuvable.");
  }

  if (!rows.every((row) => row.status === "booked")) {
    throw new Error("Ce rendez-vous ne peut plus etre deplace.");
  }

  return rows;
}

async function cancelPreviousAppointmentsAfterReschedule({
  supabase,
  rows,
}: {
  supabase: ReturnType<typeof getAdminSupabase>;
  rows: AppointmentRow[];
}) {
  for (const row of rows) {
    if (!row.google_event_id) continue;
    await deleteCalendarAppointment(row.google_event_id);
  }

  const { error } = await supabase
    .from("appointment_requests")
    .update({ status: "cancelled" })
    .in(
      "id",
      rows.map((row) => row.id),
    );

  if (error) {
    throw new Error(error.message);
  }
}

async function getAuthenticatedClient() {
  const authSupabase = await createServerSupabaseClient();
  const { data, error } = await authSupabase.auth.getUser();
  const user = data.user;

  if (error || !user?.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
  };
}

async function verifyAuditBlancAccess({
  supabase,
  email,
  dossierId,
}: {
  supabase: ReturnType<typeof getAdminSupabase>;
  email: string;
  dossierId: string | null;
}): Promise<AuditAccess | NextResponse> {
  const client = await getAuthenticatedClient();

  if (!client) {
    return NextResponse.json(
      { error: "Connexion client requise pour reserver un audit blanc." },
      { status: 401 },
    );
  }

  if (client.email !== email) {
    return NextResponse.json(
      { error: "L'adresse email doit correspondre au compte client connecte." },
      { status: 403 },
    );
  }

  let accessQuery = supabase
    .from("selen_client_tool_access")
    .select("id, status, access_type, starts_at, ends_at")
    .eq("user_id", client.id)
    .eq("tool_slug", "audit-blanc-qualiopi")
    .eq("status", "active")
    .limit(1);

  const { data: toolAccess, error: accessError } = await accessQuery;

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  let caseQuery = supabase
    .from("audit_blanc_cases")
    .select("id, dossier_id, status")
    .eq("client_email", email)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1);

  if (dossierId) {
    caseQuery = caseQuery.eq("dossier_id", dossierId);
  }

  const { data: auditCases, error: caseError } = await caseQuery;

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 500 });
  }

  const auditCase = auditCases?.[0] ?? null;

  const now = new Date();
  const hasActiveToolAccess = (toolAccess ?? []).some((access) => {
    if (access.status !== "active") return false;
    if (access.access_type === "unlimited") return true;
    if (
      access.access_type !== "limited" ||
      !access.starts_at ||
      !access.ends_at
    ) {
      return false;
    }

    return new Date(access.starts_at) <= now && new Date(access.ends_at) >= now;
  });

  if (!hasActiveToolAccess) {
    return NextResponse.json(
      { error: "Acces audit blanc actif expire ou introuvable." },
      { status: 403 },
    );
  }

  return {
    clientId: client.id,
    dossierId: dossierId || auditCase?.dossier_id || null,
    auditCaseId: auditCase?.id ?? null,
  };
}

async function syncAuditCaseAfterBooking({
  supabase,
  auditCaseId,
  appointmentType,
  appointments,
}: {
  supabase: ReturnType<typeof getAdminSupabase>;
  auditCaseId: string | null;
  appointmentType: AppointmentType;
  appointments: Array<{
    startsAt: string;
    endsAt: string;
    htmlLink?: string;
    meetLink?: string;
  }>;
}) {
  if (!auditCaseId || appointmentType === "simple_30") {
    return;
  }

  const first = appointments[0];
  const second = appointments[1];

  const payload = {
    status:
      appointmentType === "audit_2x1h45" && appointments.length < 2
        ? "partially_booked"
        : "booked",
    calendly_mode: appointmentType,
    calendly_event_1_start: first?.startsAt ?? null,
    calendly_event_1_end: first?.endsAt ?? null,
    calendly_event_1_url: first?.htmlLink ?? null,
    calendly_event_2_start: second?.startsAt ?? null,
    calendly_event_2_end: second?.endsAt ?? null,
    calendly_event_2_url: second?.htmlLink ?? null,
    meeting_url: first?.meetLink ?? null,
  };

  const { error } = await supabase
    .from("audit_blanc_cases")
    .update(payload)
    .eq("id", auditCaseId);

  if (error) {
    console.warn("Audit blanc reserve, mais dossier audit non synchronise :", {
      auditCaseId,
      error: error.message,
    });
  }
}

export async function POST(request: Request) {
  const supabase = getAdminSupabase();
  const insertedAppointmentIds: string[] = [];
  const createdGoogleEventIds: string[] = [];

  try {
    const payload = (await request.json().catch(() => null)) as
      | BookingPayload
      | null;

    if (!payload) {
      return NextResponse.json(
        { error: "Payload de reservation invalide." },
        { status: 400 },
      );
    }

    const appointmentType = normalizeAppointmentType(payload.appointmentType);
    const config = APPOINTMENT_TYPE_CONFIG[appointmentType];
    const firstName = cleanText(payload.firstName);
    const lastName = cleanText(payload.lastName);
    const email = cleanText(payload.email).toLowerCase();
    const phone = cleanText(payload.phone);
    const message = cleanText(payload.message);
    const source = getSource(cleanText(payload.source));
    const dossierId = cleanText(payload.dossierId) || null;
    const rescheduleToken = cleanText(payload.rescheduleToken) || null;
    const slots = getSlotsFromPayload(payload);
    const slotValidationError = validateSlots(slots, appointmentType);
    const previousAppointments = rescheduleToken
      ? await fetchBookedAppointmentsByManageToken({
          supabase,
          token: rescheduleToken,
        })
      : [];

    if (!firstName || !lastName || !email || !phone) {
      return NextResponse.json(
        { error: "Tous les champs obligatoires doivent etre renseignes." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Adresse email invalide." },
        { status: 400 },
      );
    }

    if (config.bookingKind === "audit_blanc" && source !== "client_space") {
      return NextResponse.json(
        { error: "Les audits blancs se reservent depuis l'espace client." },
        { status: 403 },
      );
    }

    if (
      previousAppointments.length > 0 &&
      !previousAppointments.every(
        (row) => normalizeAppointmentType(row.appointment_type) === appointmentType,
      )
    ) {
      return NextResponse.json(
        { error: "Le type de rendez-vous de deplacement ne correspond pas." },
        { status: 400 },
      );
    }

    let auditAccess: AuditAccess = {
      clientId: null,
      dossierId: null,
      auditCaseId: null,
    };

    if (config.bookingKind === "audit_blanc") {
      const access = await verifyAuditBlancAccess({
        supabase,
        email,
        dossierId,
      });

      if (access instanceof NextResponse) {
        return access;
      }

      auditAccess = access;
    }

    if (slotValidationError) {
      return NextResponse.json({ error: slotValidationError }, { status: 400 });
    }

    for (const slot of slots) {
      const isFree = await isAppointmentSlotFree(
        slot.startsAt,
        slot.endsAt,
        appointmentType,
      );

      if (!isFree) {
        return NextResponse.json(
          {
            error:
              "Un creneau vient d'etre reserve. Choisissez un autre horaire.",
          },
          { status: 409 },
        );
      }
    }

    const { calendarId, timezone } = getAppointmentCalendarPublicConfig();
    const bookingGroupId = crypto.randomUUID();
    const manageToken = createManageToken();
    const baseUrl = getBaseUrl(request);
    const manageUrl = `${baseUrl}/rdv/gerer?token=${encodeURIComponent(
      manageToken,
    )}`;
    const cancelUrl = `${manageUrl}&action=cancel`;
    const rescheduleUrl = `${manageUrl}&action=reschedule`;

    for (const [index, slot] of slots.entries()) {
      const { data: pendingAppointment, error: insertError } = await supabase
        .from("appointment_requests")
        .insert({
          source,
          appointment_type: appointmentType,
          status: "booked",
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          message,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          timezone,
          google_calendar_id: calendarId,
          client_id: auditAccess.clientId,
          dossier_id: auditAccess.dossierId || dossierId,
          booking_group_id: bookingGroupId,
          slot_index: index + 1,
          metadata: buildAppointmentMetadata({
            appointmentType,
            totalSlots: slots.length,
            manageToken,
            cancelUrl,
            rescheduleUrl,
          }),
        })
        .select("id, starts_at, ends_at, slot_index")
        .single();

      if (insertError) {
        const isDuplicateSlot =
          insertError.code === "23505" ||
          insertError.message.includes("appointment_requests_booked_slot_idx");

        if (insertedAppointmentIds.length > 0) {
          await supabase
            .from("appointment_requests")
            .delete()
            .in("id", insertedAppointmentIds);
        }

        return NextResponse.json(
          {
            error: isDuplicateSlot
              ? "Un creneau vient d'etre reserve. Choisissez un autre horaire."
              : insertError.message,
          },
          { status: isDuplicateSlot ? 409 : 500 },
        );
      }

      insertedAppointmentIds.push(pendingAppointment.id);
    }

    const appointments: Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      slot_index: number;
    }> = [];
    const calendarEvents: Array<{
      startsAt: string;
      endsAt: string;
      htmlLink?: string;
      meetLink?: string;
    }> = [];

    for (const [index, slot] of slots.entries()) {
      const calendarEvent = await createCalendarAppointment({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        appointmentType,
        slotIndex: index + 1,
        totalSlots: slots.length,
        firstName,
        lastName,
        email,
        phone,
        message,
      });

      createdGoogleEventIds.push(calendarEvent.eventId);

      calendarEvents.push({
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        htmlLink: calendarEvent.htmlLink,
        meetLink: calendarEvent.meetLink,
      });

      const { data: appointment, error: updateError } = await supabase
        .from("appointment_requests")
        .update({
          google_event_id: calendarEvent.eventId,
          google_calendar_id: calendarId,
          metadata: buildAppointmentMetadata({
            appointmentType,
            totalSlots: slots.length,
            manageToken,
            cancelUrl,
            rescheduleUrl,
            googleEventLink: calendarEvent.htmlLink,
            googleMeetLink: calendarEvent.meetLink,
          }),
        })
        .eq("id", insertedAppointmentIds[index])
        .select("id, starts_at, ends_at, slot_index")
        .single();

      if (updateError) {
        throw new Error(
          `Rendez-vous Google cree, mais event_id non enregistre : ${updateError.message}`,
        );
      }

      appointments.push(appointment);
    }

    await syncAuditCaseAfterBooking({
      supabase,
      auditCaseId: auditAccess.auditCaseId,
      appointmentType,
      appointments: calendarEvents,
    });

    if (previousAppointments.length > 0) {
      await cancelPreviousAppointmentsAfterReschedule({
        supabase,
        rows: previousAppointments,
      });
    }

    try {
      await sendAppointmentConfirmationEmail({
        appointmentType,
        firstName,
        email,
        phone,
        slots: calendarEvents,
        cancelUrl,
        rescheduleUrl,
      });
    } catch (emailError) {
      console.warn("Reservation creee, email de confirmation non envoye :", {
        error:
          emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    return NextResponse.json({
      ok: true,
      appointmentType,
      appointments,
      appointment: appointments[0] ?? null,
    });
  } catch (error) {
    for (const eventId of createdGoogleEventIds) {
      try {
        await deleteCalendarAppointment(eventId);
      } catch (deleteError) {
        console.warn("Rollback Google Calendar incomplet :", {
          eventId,
          error:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        });
      }
    }

    if (insertedAppointmentIds.length > 0) {
      await supabase
        .from("appointment_requests")
        .delete()
        .in("id", insertedAppointmentIds);
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de reserver ce rendez-vous.",
      },
      { status: 500 },
    );
  }
}
