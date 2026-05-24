import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const calendlySigningKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY?.trim();

type CalendlyPayload = {
  event?: string;
  payload?: {
    uri?: string;
    email?: string;
    name?: string;
    cancel_url?: string;
    reschedule_url?: string;
    event?: string | { uri?: string };
    event_type?: {
      name?: string;
      uri?: string;
    };
    scheduled_event?: {
      uri?: string;
      name?: string;
      start_time?: string;
      end_time?: string;
      location?: {
        type?: string;
        location?: string;
        join_url?: string;
      };
    };
    calendar_event?: {
      start_time?: string;
      end_time?: string;
      location?: string;
    };
    questions_and_answers?: Array<{
      question?: string;
      answer?: string;
    }>;
  };
};

function getSupabaseAdmin() {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL est manquante.");
  }

  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY est manquante.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function verifyCalendlySignature({
  rawBody,
  signatureHeader,
}: {
  rawBody: string;
  signatureHeader: string | null;
}) {
  // En local, on peut tester sans signature.
  // En production, ajoute CALENDLY_WEBHOOK_SIGNING_KEY dans Vercel.
  if (!calendlySigningKey) {
    console.warn(
      "CALENDLY_WEBHOOK_SIGNING_KEY absente : signature Calendly non vérifiée.",
    );
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const parts = signatureHeader
    .split(",")
    .reduce<Record<string, string>>((acc, part) => {
      const [key, value] = part.split("=");
      if (key && value) acc[key.trim()] = value.trim();
      return acc;
    }, {});

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const expectedSignature = crypto
    .createHmac("sha256", calendlySigningKey)
    .update(signedPayload, "utf8")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  } catch {
    return false;
  }
}

function getEventTypeName(payload: CalendlyPayload["payload"]) {
  return (
    payload?.event_type?.name ||
    payload?.scheduled_event?.name ||
    "Audit blanc Qualiopi"
  );
}

function getInviteeUri(payload: CalendlyPayload["payload"]) {
  return payload?.uri ?? "";
}

function getInviteeEmail(payload: CalendlyPayload["payload"]) {
  return payload?.email?.trim().toLowerCase() ?? "";
}

function getStartTime(payload: CalendlyPayload["payload"]) {
  return (
    payload?.scheduled_event?.start_time ??
    payload?.calendar_event?.start_time ??
    null
  );
}

function getEndTime(payload: CalendlyPayload["payload"]) {
  return (
    payload?.scheduled_event?.end_time ??
    payload?.calendar_event?.end_time ??
    null
  );
}

function getMeetingUrl(payload: CalendlyPayload["payload"]) {
  return (
    payload?.scheduled_event?.location?.join_url ??
    payload?.scheduled_event?.location?.location ??
    payload?.calendar_event?.location ??
    null
  );
}

function detectCalendlyMode(eventTypeName: string) {
  const normalized = eventTypeName.toLowerCase();

  if (
    normalized.includes("3h30") ||
    normalized.includes("3 h 30") ||
    normalized.includes("210")
  ) {
    return "single_3h30" as const;
  }

  if (
    normalized.includes("1h45") ||
    normalized.includes("1 h 45") ||
    normalized.includes("105")
  ) {
    return "split_2x1h45" as const;
  }

  // Fallback : si on ne sait pas, on considère un créneau unique.
  return "single_3h30" as const;
}

async function handleInviteeCreated(payload: CalendlyPayload["payload"]) {
  const supabaseAdmin = getSupabaseAdmin();

  const email = getInviteeEmail(payload);
  const inviteeUri = getInviteeUri(payload);
  const eventTypeName = getEventTypeName(payload);
  const calendlyMode = detectCalendlyMode(eventTypeName);
  const startTime = getStartTime(payload);
  const endTime = getEndTime(payload);
  const meetingUrl = getMeetingUrl(payload);

  if (!email) {
    throw new Error("Calendly n’a pas transmis d’email invité.");
  }

  if (!startTime || !endTime) {
    throw new Error("Calendly n’a pas transmis les horaires du rendez-vous.");
  }

  const { data: auditCase, error: caseError } = await supabaseAdmin
    .from("audit_blanc_cases")
    .select(
      "id, status, calendly_event_1_start, calendly_event_2_start, calendly_event_1_invitee_uri, calendly_event_2_invitee_uri",
    )
    .eq("client_email", email)
    .in("status", ["booking_pending", "partially_booked", "booked"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (caseError) {
    throw new Error(
      `Erreur recherche dossier audit blanc : ${caseError.message}`,
    );
  }

  if (!auditCase) {
    console.warn(
      `Aucun dossier audit blanc trouvé pour ${email}. Réservation Calendly ignorée.`,
    );
    return;
  }

  if (calendlyMode === "single_3h30") {
    const { error } = await supabaseAdmin
      .from("audit_blanc_cases")
      .update({
        status: "booked",
        calendly_mode: "single_3h30",
        calendly_event_1_start: startTime,
        calendly_event_1_end: endTime,
        calendly_event_1_url: payload?.scheduled_event?.uri ?? null,
        calendly_event_1_invitee_uri: inviteeUri || null,
        meeting_url: meetingUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditCase.id);

    if (error) {
      throw new Error(`Erreur mise à jour créneau 3h30 : ${error.message}`);
    }

    return;
  }

  // Mode 2 × 1h45
  const shouldFillFirstSlot =
    !auditCase.calendly_event_1_start ||
    auditCase.calendly_event_1_invitee_uri === inviteeUri;

  const updatePayload = shouldFillFirstSlot
    ? {
        status: auditCase.calendly_event_2_start
          ? "booked"
          : "partially_booked",
        calendly_mode: "split_2x1h45",
        calendly_event_1_start: startTime,
        calendly_event_1_end: endTime,
        calendly_event_1_url: payload?.scheduled_event?.uri ?? null,
        calendly_event_1_invitee_uri: inviteeUri || null,
        meeting_url: meetingUrl,
        updated_at: new Date().toISOString(),
      }
    : {
        status: "booked",
        calendly_mode: "split_2x1h45",
        calendly_event_2_start: startTime,
        calendly_event_2_end: endTime,
        calendly_event_2_url: payload?.scheduled_event?.uri ?? null,
        calendly_event_2_invitee_uri: inviteeUri || null,
        meeting_url: meetingUrl,
        updated_at: new Date().toISOString(),
      };

  const { error } = await supabaseAdmin
    .from("audit_blanc_cases")
    .update(updatePayload)
    .eq("id", auditCase.id);

  if (error) {
    throw new Error(`Erreur mise à jour créneau 1h45 : ${error.message}`);
  }
}

async function handleInviteeCanceled(payload: CalendlyPayload["payload"]) {
  const supabaseAdmin = getSupabaseAdmin();

  const email = getInviteeEmail(payload);
  const inviteeUri = getInviteeUri(payload);

  if (!email && !inviteeUri) {
    throw new Error("Calendly n’a transmis ni email ni URI invité.");
  }

  let query = supabaseAdmin
    .from("audit_blanc_cases")
    .select(
      "id, calendly_event_1_invitee_uri, calendly_event_2_invitee_uri, calendly_event_1_start, calendly_event_2_start",
    )
    .limit(1);

  if (inviteeUri) {
    query = query.or(
      `calendly_event_1_invitee_uri.eq.${inviteeUri},calendly_event_2_invitee_uri.eq.${inviteeUri}`,
    );
  } else {
    query = query.eq("client_email", email).order("created_at", {
      ascending: false,
    });
  }

  const { data: auditCase, error: caseError } = await query.maybeSingle();

  if (caseError) {
    throw new Error(
      `Erreur recherche dossier à annuler : ${caseError.message}`,
    );
  }

  if (!auditCase) {
    console.warn("Aucun dossier audit blanc trouvé pour annulation Calendly.");
    return;
  }

  const isFirstSlot = auditCase.calendly_event_1_invitee_uri === inviteeUri;
  const isSecondSlot = auditCase.calendly_event_2_invitee_uri === inviteeUri;

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (isFirstSlot) {
    updatePayload.calendly_event_1_start = null;
    updatePayload.calendly_event_1_end = null;
    updatePayload.calendly_event_1_url = null;
    updatePayload.calendly_event_1_invitee_uri = null;
  }

  if (isSecondSlot) {
    updatePayload.calendly_event_2_start = null;
    updatePayload.calendly_event_2_end = null;
    updatePayload.calendly_event_2_url = null;
    updatePayload.calendly_event_2_invitee_uri = null;
  }

  const remainingFirst = isFirstSlot ? null : auditCase.calendly_event_1_start;
  const remainingSecond = isSecondSlot
    ? null
    : auditCase.calendly_event_2_start;

  if (remainingFirst && remainingSecond) {
    updatePayload.status = "booked";
  } else if (remainingFirst || remainingSecond) {
    updatePayload.status = "partially_booked";
  } else {
    updatePayload.status = "booking_pending";
    updatePayload.calendly_mode = null;
    updatePayload.meeting_url = null;
  }

  const { error } = await supabaseAdmin
    .from("audit_blanc_cases")
    .update(updatePayload)
    .eq("id", auditCase.id);

  if (error) {
    throw new Error(`Erreur annulation Calendly : ${error.message}`);
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get("Calendly-Webhook-Signature");

  const isValidSignature = verifyCalendlySignature({
    rawBody,
    signatureHeader,
  });

  if (!isValidSignature) {
    return NextResponse.json(
      { error: "Signature Calendly invalide." },
      { status: 401 },
    );
  }

  let body: CalendlyPayload;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Payload Calendly invalide." },
      { status: 400 },
    );
  }

  try {
    if (body.event === "invitee.created") {
      await handleInviteeCreated(body.payload);
    }

    if (body.event === "invitee.canceled") {
      await handleInviteeCanceled(body.payload);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Erreur webhook Calendly :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue webhook Calendly.",
      },
      { status: 500 },
    );
  }
}
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "Calendly webhook",
    message:
      "Cette route est active. Elle attend les événements Calendly en POST.",
  });
}
