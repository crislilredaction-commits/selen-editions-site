import { NextResponse } from "next/server";

import {
  APPOINTMENT_TYPE_CONFIG,
  type AppointmentSlot,
  getAvailableAppointmentSlots,
  normalizeAppointmentType,
} from "@/lib/server/googleCalendar";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

function cleanText(value: string | null) {
  return value?.trim() ?? "";
}

async function hasClientSession() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  return !error && Boolean(data.user);
}

async function hasActiveAuditBlancAccess() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;

  if (error || !user) return false;

  const { data: access, error: accessError } = await supabase
    .from("selen_client_tool_access")
    .select("status, access_type, starts_at, ends_at")
    .eq("user_id", user.id)
    .eq("tool_slug", "audit-blanc-qualiopi")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (accessError || !access || access.status !== "active") return false;
  if (access.access_type === "unlimited") return true;
  if (access.access_type !== "limited" || !access.starts_at || !access.ends_at)
    return false;

  const now = new Date();
  return new Date(access.starts_at) <= now && new Date(access.ends_at) >= now;
}

function addDays(date: string, days: number) {
  const current = new Date(`${date}T12:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + days);
  return current.toISOString().slice(0, 10);
}

async function getNextAvailableSlots({
  date,
  appointmentType,
  limit = 8,
}: {
  date: string;
  appointmentType: ReturnType<typeof normalizeAppointmentType>;
  limit?: number;
}) {
  const nextSlots: AppointmentSlot[] = [];

  for (let offset = 1; offset <= 21 && nextSlots.length < limit; offset++) {
    const day = addDays(date, offset);
    const slots = await getAvailableAppointmentSlots(day, appointmentType);
    nextSlots.push(...slots.slice(0, limit - nextSlots.length));
  }

  return nextSlots;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = cleanText(url.searchParams.get("date"));
    const source =
      cleanText(url.searchParams.get("source")) === "client_space"
        ? "client_space"
        : "public_site";
    const appointmentType = normalizeAppointmentType(
      url.searchParams.get("appointmentType"),
    );
    const config = APPOINTMENT_TYPE_CONFIG[appointmentType];

    if (!date || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    }

    if (config.bookingKind === "audit_blanc") {
      if (source !== "client_space" || !(await hasClientSession())) {
        return NextResponse.json(
          { error: "Connexion client requise pour reserver un audit blanc." },
          { status: 403 },
        );
      }

      if (!(await hasActiveAuditBlancAccess())) {
        return NextResponse.json(
          { error: "Acces audit blanc actif expire ou introuvable." },
          { status: 403 },
        );
      }
    }

    const slots = await getAvailableAppointmentSlots(date, appointmentType);
    const nextAvailableSlots =
      slots.length === 0
        ? await getNextAvailableSlots({ date, appointmentType })
        : [];

    return NextResponse.json({
      ok: true,
      appointmentType,
      slots,
      nextAvailableSlots,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Impossible de charger les creneaux.",
      },
      { status: 500 },
    );
  }
}
