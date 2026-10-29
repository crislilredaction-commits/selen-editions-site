import { Resend } from "resend";

import {
  APPOINTMENT_TYPE_CONFIG,
  type AppointmentType,
} from "@/lib/server/googleCalendar";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

type AppointmentEmailSlot = {
  startsAt: string;
  endsAt: string;
  meetLink?: string | null;
};

type SendAppointmentConfirmationEmailInput = {
  appointmentType: AppointmentType;
  firstName: string;
  email: string;
  phone: string;
  slots: AppointmentEmailSlot[];
  cancelUrl: string;
  rescheduleUrl: string;
};

type SendAppointmentCancellationEmailInput = {
  firstName: string;
  email: string;
  startsAt: string;
  rescheduleUrl: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function formatSlotLine(slot: AppointmentEmailSlot, index: number) {
  const prefix = index > 0 ? `Creneau ${index + 1} : ` : "";
  return `${prefix}${formatDate(slot.startsAt)} de ${formatTime(
    slot.startsAt,
  )} a ${formatTime(slot.endsAt)}`;
}

export async function sendAppointmentConfirmationEmail({
  appointmentType,
  firstName,
  email,
  phone,
  slots,
  cancelUrl,
  rescheduleUrl,
}: SendAppointmentConfirmationEmailInput) {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY absente : email de confirmation rendez-vous non envoye.",
    );
    return { sent: false, reason: "missing_resend_api_key" as const };
  }

  const config = APPOINTMENT_TYPE_CONFIG[appointmentType];
  const isAudit = config.bookingKind === "audit_blanc";
  const subject = isAudit
    ? "Votre audit blanc Selen est confirme"
    : "Votre rendez-vous Selen est confirme";
  const slotLines = slots.map(formatSlotLine).join("\n");
  const firstMeetLink = slots.find((slot) => slot.meetLink)?.meetLink;

  const text = isAudit
    ? [
        `Bonjour ${firstName},`,
        "",
        `Votre rendez-vous d'audit blanc est confirme le ${slotLines}.`,
        "Il se deroulera en visioconference.",
        "Merci de verifier avant le rendez-vous que votre camera et votre micro fonctionnent correctement.",
        "Preparez egalement vos documents au format numerique : certains elements pourront vous etre demandes en partage d'ecran pendant l'audit.",
        `Lien de visioconference : ${firstMeetLink ?? "il sera transmis dans l'invitation agenda."}`,
        `Lien pour annuler : ${cancelUrl}`,
        `Lien pour deplacer : ${rescheduleUrl}`,
        "",
        "A bientot,",
        "Selen Editions",
      ].join("\n")
    : [
        `Bonjour ${firstName},`,
        "",
        `Votre rendez-vous avec Selen est confirme le ${slotLines}.`,
        `Ce rendez-vous se deroulera par telephone. Selen vous appellera au numero renseigne (${phone}) depuis le 06 73 58 57 47.`,
        `Lien pour annuler : ${cancelUrl}`,
        `Lien pour deplacer : ${rescheduleUrl}`,
        "",
        "A bientot,",
        "Selen Editions",
      ].join("\n");

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject,
    text,
    html: `<div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">${text
      .split("\n")
      .map((line) => (line ? `<p>${line}</p>` : "<br />"))
      .join("")}</div>`,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    throw new Error(`Erreur Resend : ${error.message}`);
  }

  return { sent: true as const };
}

export async function sendAppointmentCancellationEmail({
  firstName,
  email,
  startsAt,
  rescheduleUrl,
}: SendAppointmentCancellationEmailInput) {
  if (!resend) {
    console.warn(
      "RESEND_API_KEY absente : email d'annulation rendez-vous non envoye.",
    );
    return { sent: false, reason: "missing_resend_api_key" as const };
  }

  const text = [
    `Bonjour ${firstName},`,
    "",
    `Votre rendez-vous Selen prevu le ${formatDate(startsAt)} a ${formatTime(
      startsAt,
    )} a bien ete annule.`,
    `Vous pouvez reprendre un nouveau creneau ici : ${rescheduleUrl}`,
    "",
    "A bientot,",
    "Selen Editions",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: email,
    subject: "Votre rendez-vous Selen a ete annule",
    text,
    html: `<div style="font-family: Arial, sans-serif; color: #3e2a1f; line-height: 1.6; max-width: 640px;">${text
      .split("\n")
      .map((line) => (line ? `<p>${line}</p>` : "<br />"))
      .join("")}</div>`,
    replyTo: "hello@selen-editions.fr",
  });

  if (error) {
    throw new Error(`Erreur Resend : ${error.message}`);
  }

  return { sent: true as const };
}
