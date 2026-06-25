"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ManagedBooking = {
  appointmentType: string;
  appointmentLabel: string;
  bookingKind: string;
  status: "booked" | "cancelled" | "completed";
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  canManage: boolean;
  rescheduleUrl: string;
  appointments: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    slotIndex: number | null;
    status: string | null;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ManageAppointmentClient() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadBooking() {
      if (!token) {
        setError("Lien de gestion invalide.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/appointments/manage?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.error ?? "Rendez-vous introuvable.");
        }

        setBooking(data.booking);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger le rendez-vous.",
        );
      } finally {
        setLoading(false);
      }
    }

    void loadBooking();
  }, [token]);

  async function runAction(nextAction: "cancel" | "reschedule") {
    if (!token || submitting) return;

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/appointments/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: nextAction }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Action impossible.");
      }

      setBooking(data.booking);

      if (nextAction === "reschedule" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      setMessage("Votre rendez-vous a bien ete annule.");
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Action impossible.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="gazette-card p-6 md:p-8">
      <div className="gazette-band" />

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>
          Chargement de votre rendez-vous...
        </p>
      ) : error ? (
        <p style={{ color: "var(--rust)" }}>{error}</p>
      ) : booking ? (
        <div style={{ display: "grid", gap: "1rem" }}>
          <p className="gazette-label w-fit">{booking.appointmentLabel}</p>
          <h1 className="text-3xl md:text-4xl">Votre rendez-vous</h1>

          <div style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}>
            {booking.appointments.map((appointment) => (
              <p key={appointment.id}>
                {booking.appointments.length > 1
                  ? `Creneau ${appointment.slotIndex ?? ""} : `
                  : ""}
                {formatDateTime(appointment.startsAt)}
              </p>
            ))}
            <p>Statut : {booking.status}</p>
          </div>

          {message && (
            <p style={{ color: "var(--ocre-dark)", fontWeight: 700 }}>
              {message}
            </p>
          )}

          {booking.canManage ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <button
                className="btn-ink"
                type="button"
                disabled={submitting}
                onClick={() => void runAction("cancel")}
                style={{ opacity: submitting ? 0.65 : 1 }}
              >
                <span>
                  {submitting ? "Annulation..." : "Annuler le rendez-vous"}
                </span>
              </button>
              <button
                className="btn-ink"
                type="button"
                disabled={submitting}
                onClick={() => void runAction("reschedule")}
                style={{ opacity: submitting ? 0.65 : 1 }}
              >
                <span>Deplacer le rendez-vous</span>
              </button>
            </div>
          ) : (
            <p style={{ color: "var(--ink-faint)" }}>
              Ce rendez-vous ne peut plus etre modifie depuis ce lien.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}
