const DEFAULT_TIMEZONE = "Europe/Paris";
const DEFAULT_CALENDAR_ID = "crislil.redaction@gmail.com";
const SLOT_STEP_MINUTES = 30;

export type AppointmentType = "simple_30" | "audit_3h30" | "audit_2x1h45";

type AppointmentTypeConfig = {
  label: string;
  durationMinutes: number;
  eventPrefix: string;
  bookingKind: "simple" | "audit_blanc";
};

export const APPOINTMENT_TYPE_CONFIG: Record<
  AppointmentType,
  AppointmentTypeConfig
> = {
  simple_30: {
    label: "Rendez-vous simple - 30 min",
    durationMinutes: 30,
    eventPrefix: "RDV Selen",
    bookingKind: "simple",
  },
  audit_3h30: {
    label: "Audit blanc - 3h30",
    durationMinutes: 210,
    eventPrefix: "Audit blanc Selen",
    bookingKind: "audit_blanc",
  },
  audit_2x1h45: {
    label: "Audit blanc - 1h45",
    durationMinutes: 105,
    eventPrefix: "Audit blanc Selen",
    bookingKind: "audit_blanc",
  },
};

type GoogleBusyRange = {
  start: string;
  end: string;
};

type AvailabilityWindow = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type CalendarEventInput = {
  startsAt: string;
  endsAt: string;
  appointmentType: AppointmentType;
  slotIndex?: number;
  totalSlots?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message?: string;
};

export type AppointmentSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

function getWeekday(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function getAvailabilityWindows(
  date: string,
  appointmentType: AppointmentType,
): AvailabilityWindow[] {
  const weekday = getWeekday(date);
  const bookingKind = APPOINTMENT_TYPE_CONFIG[appointmentType].bookingKind;

  if (bookingKind === "simple") {
    if (weekday === 1 || weekday === 5) {
      return [{ startHour: 10, startMinute: 0, endHour: 18, endMinute: 0 }];
    }

    if (weekday >= 2 && weekday <= 4) {
      return [{ startHour: 16, startMinute: 0, endHour: 18, endMinute: 0 }];
    }

    return [];
  }

  if (weekday === 2 || weekday === 4) {
    return [{ startHour: 9, startMinute: 0, endHour: 18, endMinute: 0 }];
  }

  if (weekday === 3) {
    return [{ startHour: 9, startMinute: 0, endHour: 12, endMinute: 30 }];
  }

  return [];
}

export function normalizeAppointmentType(
  value?: string | null,
): AppointmentType {
  if (
    value === "simple_30" ||
    value === "audit_3h30" ||
    value === "audit_2x1h45"
  ) {
    return value;
  }

  return "simple_30";
}

function splitCalendarIds(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCalendarConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  const calendarId =
    process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_CALENDAR_ID;
  const timezone =
    process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const busyCalendarIds = [
    ...new Set([
      calendarId,
      ...splitCalendarIds(process.env.GOOGLE_BUSY_CALENDAR_IDS),
    ]),
  ];

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Configuration Google Calendar incomplete. Verifiez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et GOOGLE_REFRESH_TOKEN.",
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId,
    timezone,
    busyCalendarIds,
  };
}

async function getAccessToken() {
  const { clientId, clientSecret, refreshToken } = getCalendarConfig();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw new Error(
      data?.error_description ??
        data?.error ??
        "Impossible d'obtenir un acces Google Calendar.",
    );
  }

  return data.access_token as string;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return localAsUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMs);
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSlotLabel(startsAt: string, endsAt: string, timeZone: string) {
  return `${formatTime(startsAt, timeZone)} - ${formatTime(endsAt, timeZone)}`;
}

function rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

async function getBusyRanges(timeMin: string, timeMax: string) {
  const { busyCalendarIds, timezone } = getCalendarConfig();
  const accessToken = await getAccessToken();

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: timezone,
        items: busyCalendarIds.map((id) => ({ id })),
      }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.error?.message ?? "Impossible de consulter les disponibilites.",
    );
  }

  const calendars = data?.calendars ?? {};
  const ranges: GoogleBusyRange[] = [];

  for (const calendarId of busyCalendarIds) {
    const calendar = calendars[calendarId];

    if (calendar?.errors?.length) {
      throw new Error(
        `Impossible de consulter le calendrier ${calendarId}.`,
      );
    }

    ranges.push(...((calendar?.busy ?? []) as GoogleBusyRange[]));
  }

  return ranges;
}

export async function getAvailableAppointmentSlots(
  date: string,
  appointmentType: AppointmentType = "simple_30",
) {
  const { timezone } = getCalendarConfig();
  const durationMinutes =
    APPOINTMENT_TYPE_CONFIG[appointmentType].durationMinutes;
  const windows = getAvailabilityWindows(date, appointmentType);

  if (windows.length === 0) {
    return [];
  }

  const dayStart = zonedDateTimeToUtc(
    date,
    Math.min(...windows.map((window) => window.startHour)),
    0,
    timezone,
  );
  const latestWindow = windows.reduce((latest, current) => {
    const latestMinutes = latest.endHour * 60 + latest.endMinute;
    const currentMinutes = current.endHour * 60 + current.endMinute;
    return currentMinutes > latestMinutes ? current : latest;
  });
  const dayEnd = zonedDateTimeToUtc(
    date,
    latestWindow.endHour,
    latestWindow.endMinute,
    timezone,
  );
  const busyRanges = await getBusyRanges(
    dayStart.toISOString(),
    dayEnd.toISOString(),
  );
  const slots: AppointmentSlot[] = [];
  const now = new Date();

  for (const window of windows) {
    const windowStart = zonedDateTimeToUtc(
      date,
      window.startHour,
      window.startMinute,
      timezone,
    );
    const windowEnd = zonedDateTimeToUtc(
      date,
      window.endHour,
      window.endMinute,
      timezone,
    );

    for (
      let cursor = new Date(windowStart);
      cursor.getTime() + durationMinutes * 60_000 <= windowEnd.getTime();
      cursor = new Date(cursor.getTime() + SLOT_STEP_MINUTES * 60_000)
    ) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);

      if (slotStart <= now) {
        continue;
      }

      const isBusy = busyRanges.some((range) =>
        rangesOverlap(
          slotStart,
          slotEnd,
          new Date(range.start),
          new Date(range.end),
        ),
      );

      if (!isBusy) {
        slots.push({
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          label: formatSlotLabel(
            slotStart.toISOString(),
            slotEnd.toISOString(),
            timezone,
          ),
        });
      }
    }
  }

  return slots;
}

function isSlotInsideAvailability(
  startsAt: string,
  endsAt: string,
  appointmentType: AppointmentType,
) {
  const { timezone } = getCalendarConfig();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(startsAt));
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  return getAvailabilityWindows(date, appointmentType).some((window) => {
    const windowStart = zonedDateTimeToUtc(
      date,
      window.startHour,
      window.startMinute,
      timezone,
    ).getTime();
    const windowEnd = zonedDateTimeToUtc(
      date,
      window.endHour,
      window.endMinute,
      timezone,
    ).getTime();

    return start >= windowStart && end <= windowEnd;
  });
}

export async function isAppointmentSlotFree(
  startsAt: string,
  endsAt: string,
  appointmentType: AppointmentType = "simple_30",
) {
  if (!isSlotInsideAvailability(startsAt, endsAt, appointmentType)) {
    return false;
  }

  const busyRanges = await getBusyRanges(startsAt, endsAt);
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return !busyRanges.some((range) =>
    rangesOverlap(start, end, new Date(range.start), new Date(range.end)),
  );
}

export async function createCalendarAppointment(input: CalendarEventInput) {
  const { calendarId, timezone } = getCalendarConfig();
  const accessToken = await getAccessToken();
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const config = APPOINTMENT_TYPE_CONFIG[input.appointmentType];
  const totalSlots = input.totalSlots ?? 1;
  const suffix =
    input.appointmentType === "audit_2x1h45" && input.slotIndex
      ? ` (${input.slotIndex}/${totalSlots})`
      : "";
  const shouldCreateMeet = config.bookingKind === "audit_blanc";

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `${config.eventPrefix}${suffix} - ${fullName}`,
        description: [
          `Type : ${config.label}${suffix}`,
          `Prenom : ${input.firstName}`,
          `Nom : ${input.lastName}`,
          `Email : ${input.email}`,
          `Telephone : ${input.phone}`,
          "",
          "Message :",
          input.message || "Non renseigne",
        ].join("\n"),
        start: {
          dateTime: input.startsAt,
          timeZone: timezone,
        },
        end: {
          dateTime: input.endsAt,
          timeZone: timezone,
        },
        attendees: [{ email: input.email }],
        ...(shouldCreateMeet
          ? {
              conferenceData: {
                createRequest: {
                  requestId: `selen-${crypto.randomUUID()}`,
                  conferenceSolutionKey: {
                    type: "hangoutsMeet",
                  },
                },
              },
            }
          : {}),
      }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error(
      data?.error?.message ?? "Impossible de creer le rendez-vous Google.",
    );
  }

  return {
    eventId: data.id as string,
    htmlLink: data.htmlLink as string | undefined,
    meetLink: data.hangoutLink as string | undefined,
    calendarId,
    timezone,
  };
}

export async function deleteCalendarAppointment(eventId: string) {
  const { calendarId } = getCalendarConfig();
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (response.status === 404 || response.status === 410) {
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.error?.message ?? "Impossible d'annuler l'evenement Google.",
    );
  }
}

export function getAppointmentCalendarPublicConfig() {
  const { calendarId, timezone } = getCalendarConfig();
  return { calendarId, timezone };
}
