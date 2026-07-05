"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

type AppointmentType = "simple_30" | "audit_3h30" | "audit_2x1h45" | "daily_setup_1h30";

type AppointmentSource = "public_site" | "client_space";

type AppointmentSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

type AppointmentBookingProps = {
  source?: AppointmentSource;
  defaultAppointmentType?: AppointmentType;
  allowedAppointmentTypes?: AppointmentType[];
  dossierId?: string | null;
  rescheduleToken?: string | null;
};

const APPOINTMENT_OPTIONS: Array<{
  value: AppointmentType;
  label: string;
  helper: string;
}> = [
  {
    value: "simple_30",
    label: "Rendez-vous simple",
    helper: "30 minutes par telephone",
  },
  {
    value: "audit_3h30",
    label: "Audit blanc 3h30",
    helper: "Une session en visioconference",
  },
  {
    value: "audit_2x1h45",
    label: "Audit blanc 2 x 1h45",
    helper: "Deux sessions en visioconference",
  },
  {
    value: "daily_setup_1h30",
    label: "Paramétrage Selen Daily",
    helper: "1 h 30 en visioconference",
  },
];

function normalizeAppointmentType(value?: string | null): AppointmentType {
  if (
    value === "simple_30" ||
    value === "audit_3h30" ||
    value === "audit_2x1h45" ||
    value === "daily_setup_1h30"
  ) {
    return value;
  }

  return "simple_30";
}

function getExpectedSlotCount(appointmentType: AppointmentType) {
  return appointmentType === "audit_2x1h45" ? 2 : 1;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatConfirmationDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AppointmentBooking({
  source = "public_site",
  defaultAppointmentType = "simple_30",
  allowedAppointmentTypes,
  dossierId,
  rescheduleToken,
}: AppointmentBookingProps) {
  const allowedTypes = useMemo(() => {
    const fallback =
      source === "public_site"
        ? (["simple_30"] as AppointmentType[])
        : (["simple_30", "audit_3h30", "audit_2x1h45", "daily_setup_1h30"] as AppointmentType[]);

    return allowedAppointmentTypes?.length ? allowedAppointmentTypes : fallback;
  }, [allowedAppointmentTypes, source]);

  const initialType = allowedTypes.includes(defaultAppointmentType)
    ? defaultAppointmentType
    : allowedTypes[0];

  const [appointmentType, setAppointmentType] =
    useState<AppointmentType>(initialType);
  const [dates, setDates] = useState<string[]>([getToday(), getToday()]);
  const [slotsByIndex, setSlotsByIndex] = useState<
    Record<number, AppointmentSlot[]>
  >({});
  const [nextSlotsByIndex, setNextSlotsByIndex] = useState<
    Record<number, AppointmentSlot[]>
  >({});
  const [selectedSlots, setSelectedSlots] = useState<
    Array<AppointmentSlot | null>
  >([null, null]);
  const [bookedSlots, setBookedSlots] = useState<AppointmentSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
  });

  const expectedSlotCount = getExpectedSlotCount(appointmentType);
  const visibleOptions = APPOINTMENT_OPTIONS.filter((option) =>
    allowedTypes.includes(option.value),
  );

  useEffect(() => {
    setSelectedSlots([null, null]);
    setSlotsByIndex({});
    setNextSlotsByIndex({});
    setBookedSlots([]);
    setSuccessMessage("");
  }, [appointmentType]);

  useEffect(() => {
    let cancelled = false;

    async function loadSlots(index: number) {
      const date = dates[index];
      if (!date) return;

      setLoadingSlots((current) => ({ ...current, [index]: true }));
      setError("");

      try {
        const params = new URLSearchParams({
          date,
          appointmentType,
          source,
        });
        const response = await fetch(`/api/appointments/slots?${params}`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error ?? "Impossible de charger les creneaux.");
        }

        if (!cancelled) {
          setSlotsByIndex((current) => ({
            ...current,
            [index]: data?.slots ?? [],
          }));
          setNextSlotsByIndex((current) => ({
            ...current,
            [index]: data?.nextAvailableSlots ?? [],
          }));
        }
      } catch (slotError) {
        if (!cancelled) {
          setSlotsByIndex((current) => ({ ...current, [index]: [] }));
          setNextSlotsByIndex((current) => ({ ...current, [index]: [] }));
          setError(
            slotError instanceof Error
              ? slotError.message
              : "Impossible de charger les creneaux.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots((current) => ({ ...current, [index]: false }));
        }
      }
    }

    for (let index = 0; index < expectedSlotCount; index++) {
      void loadSlots(index);
    }

    return () => {
      cancelled = true;
    };
  }, [appointmentType, dates, expectedSlotCount, source]);

  function updateDate(index: number, value: string) {
    setDates((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setSelectedSlots((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || successMessage) return;

    setError("");
    setSuccessMessage("");

    const slots = selectedSlots.slice(0, expectedSlotCount);

    if (slots.some((slot) => !slot)) {
      setError("Choisissez un creneau pour chaque rendez-vous.");
      return;
    }

    const uniqueStarts = new Set(slots.map((slot) => slot?.startsAt));
    if (uniqueStarts.size !== slots.length) {
      setError("Les deux creneaux doivent etre distincts.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          appointmentType,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          message: form.message,
          dossierId,
          rescheduleToken,
          slots: slots.map((slot) => ({
            startsAt: slot?.startsAt,
            endsAt: slot?.endsAt,
          })),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible de reserver ce rendez-vous.");
      }

      setBookedSlots(slots.filter(Boolean) as AppointmentSlot[]);

      setSuccessMessage(
        appointmentType === "audit_2x1h45"
          ? "Vos deux creneaux d'audit blanc sont confirmes. Vous allez recevoir un email de confirmation."
          : "Votre rendez-vous est confirme. Vous allez recevoir un email de confirmation.",
      );
    } catch (bookingError) {
      setError(
        bookingError instanceof Error
          ? bookingError.message
          : "Impossible de reserver ce rendez-vous.",
      );
    } finally {
      if (!successMessage) {
        setSubmitting(false);
      }
    }
  }

  return (
    <section className="gazette-card p-6 md:p-8">
      <div className="gazette-band" />

      <div style={{ display: "grid", gap: "1.2rem" }}>
        {visibleOptions.length > 1 && (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <label className="gazette-label" htmlFor="appointment-type">
              Type de rendez-vous
            </label>
            <select
              id="appointment-type"
              value={appointmentType}
              onChange={(event) =>
                setAppointmentType(normalizeAppointmentType(event.target.value))
              }
              style={{
                border: "1px solid var(--ocre)",
                padding: "0.85rem",
                background: "rgba(255,255,255,0.7)",
                color: "var(--ink)",
              }}
            >
              {visibleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.helper}
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={submitBooking} style={{ display: "grid", gap: "1rem" }}>
          <fieldset
            disabled={Boolean(successMessage)}
            style={{
              border: 0,
              padding: 0,
              margin: 0,
              display: "grid",
              gap: "1rem",
            }}
          >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.85rem",
            }}
          >
            <input
              required
              value={form.firstName}
              onChange={(event) => updateField("firstName", event.target.value)}
              placeholder="Prenom"
              style={inputStyle}
            />
            <input
              required
              value={form.lastName}
              onChange={(event) => updateField("lastName", event.target.value)}
              placeholder="Nom"
              style={inputStyle}
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              placeholder="Email"
              style={inputStyle}
            />
            <input
              required
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              placeholder="Telephone"
              style={inputStyle}
            />
          </div>

          <textarea
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            placeholder="Message ou precision utile"
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          {Array.from({ length: expectedSlotCount }).map((_, index) => (
            <div key={index} style={{ display: "grid", gap: "0.75rem" }}>
              <label className="gazette-label" htmlFor={`date-${index}`}>
                {expectedSlotCount > 1
                  ? `Creneau ${index + 1}`
                  : "Creneau"}
              </label>
              <input
                id={`date-${index}`}
                type="date"
                min={getToday()}
                value={dates[index] ?? getToday()}
                onChange={(event) => updateDate(index, event.target.value)}
                style={inputStyle}
              />

              {loadingSlots[index] ? (
                <p style={{ color: "var(--ink-faint)" }}>
                  Chargement des disponibilites...
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "0.65rem",
                  }}
                >
                  {(slotsByIndex[index] ?? []).map((slot) => {
                    const selected =
                      selectedSlots[index]?.startsAt === slot.startsAt;

                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        onClick={() =>
                          setSelectedSlots((current) => {
                            const next = [...current];
                            next[index] = slot;
                            return next;
                          })
                        }
                        style={{
                          border: selected
                            ? "2px solid var(--ink)"
                            : "1px solid var(--ocre)",
                          background: selected
                            ? "rgba(62,42,31,0.08)"
                            : "rgba(255,255,255,0.65)",
                          color: "var(--ink)",
                          padding: "0.75rem",
                          cursor: "pointer",
                          textAlign: "center",
                        }}
                      >
                        {slot.label}
                      </button>
                    );
                  })}

                  {!loadingSlots[index] &&
                    (slotsByIndex[index] ?? []).length === 0 && (
                      <div style={{ color: "var(--ink-faint)", lineHeight: 1.6 }}>
                        <p>
                          Aucun creneau disponible ce jour. Choisissez une autre
                          date.
                        </p>
                        {(nextSlotsByIndex[index] ?? []).length > 0 && (
                          <div style={{ display: "grid", gap: "0.5rem" }}>
                            <p>Prochains creneaux disponibles :</p>
                            {(nextSlotsByIndex[index] ?? []).map((slot) => (
                              <button
                                key={slot.startsAt}
                                type="button"
                                onClick={() => {
                                  const nextDate = slot.startsAt.slice(0, 10);
                                  updateDate(index, nextDate);
                                  setSelectedSlots((current) => {
                                    const next = [...current];
                                    next[index] = slot;
                                    return next;
                                  });
                                }}
                                style={{
                                  border: "1px solid var(--ocre)",
                                  background: "rgba(255,255,255,0.65)",
                                  color: "var(--ink)",
                                  padding: "0.75rem",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                {formatConfirmationDate(slot.startsAt)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          ))}
          </fieldset>

          {(bookedSlots.length > 0 || selectedSlots.some(Boolean)) && (
            <div style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
              {(bookedSlots.length > 0
                ? bookedSlots
                : selectedSlots
              )
                .slice(0, expectedSlotCount)
                .filter(Boolean)
                .map((slot, index) => (
                  <p key={slot?.startsAt}>
                    {expectedSlotCount > 1 ? `Creneau ${index + 1} : ` : ""}
                    {formatConfirmationDate(slot!.startsAt)}
                  </p>
                ))}
            </div>
          )}

          {error && <p style={{ color: "var(--rust)" }}>{error}</p>}
          {successMessage && (
            <p style={{ color: "var(--ocre-dark)", fontWeight: 700 }}>
              {successMessage}
            </p>
          )}

          {!successMessage && (
            <button
              className="btn-ink"
              type="submit"
              disabled={submitting}
              style={{
                opacity: submitting ? 0.65 : 1,
                width: "fit-content",
              }}
            >
              <span>
                {submitting ? "Reservation..." : "Confirmer le rendez-vous"}
              </span>
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--ocre)",
  padding: "0.85rem",
  background: "rgba(255,255,255,0.75)",
  color: "var(--ink)",
  width: "100%",
};
