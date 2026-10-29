import { Resend } from "resend";

import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFromEmail =
  process.env.RESEND_FROM_EMAIL || "Selen Editions <hello@selen-editions.fr>";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SupportMetadata = Record<string, unknown>;

export type CreateSupportTicketInput = {
  clientName?: unknown;
  clientEmail?: unknown;
  subject?: unknown;
  category?: unknown;
  message?: unknown;
  dossierId?: unknown;
  toolSlug?: unknown;
  pageUrl?: unknown;
  metadata?: unknown;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function asMetadata(value: unknown): SupportMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as SupportMetadata) };
}

async function sendClientAcknowledgement(clientEmail: string) {
  if (!resend) {
    return false;
  }

  const bookingUrl = `${siteUrl.replace(/\/$/, "")}/prendre-rendez-vous`;
  const text = [
    "Bonjour,",
    "",
    "Nous avons bien reçu votre demande.",
    "Elle a été transmise au support Selen et nous vous répondrons par email.",
    "Vous pouvez aussi prendre un rendez-vous téléphonique si besoin.",
    "",
    `Prendre rendez-vous : ${bookingUrl}`,
    "",
    "L'équipe Selen",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: resendFromEmail,
    to: clientEmail,
    subject: "Demande reçue par Selen",
    text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  const clientName = clean(input.clientName);
  const clientEmail = clean(input.clientEmail).toLowerCase();
  const subject = clean(input.subject);
  const category = clean(input.category) || "question";
  const message = clean(input.message);
  const dossierId = clean(input.dossierId);
  const toolSlug = clean(input.toolSlug);
  const pageUrl = clean(input.pageUrl);
  const metadata = asMetadata(input.metadata);

  if (!clientEmail || !isValidEmail(clientEmail)) {
    return {
      ok: false as const,
      status: 400,
      error: "Adresse email invalide.",
    };
  }

  if (!subject || !message) {
    return {
      ok: false as const,
      status: 400,
      error: "Sujet et message obligatoires.",
    };
  }

  const now = new Date().toISOString();
  const source = clean(metadata.source) || "vitrine_support_form";
  const ticketMetadata = {
    ...metadata,
    source,
    page_url: pageUrl || metadata.page_url || null,
    dossier_id: dossierId || metadata.dossier_id || null,
    tool_slug: toolSlug || metadata.tool_slug || null,
  };

  const supabase = getAdminSupabase();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      client_email: clientEmail,
      client_name: clientName || null,
      subject,
      category,
      status: "open",
      priority: "normal",
      last_message_at: now,
      metadata: ticketMetadata,
    })
    .select("id")
    .single();

  if (ticketError || !ticket) {
    return {
      ok: false as const,
      status: 500,
      error: ticketError?.message ?? "Ticket support non créé.",
    };
  }

  const { error: messageError } = await supabase
    .from("support_messages")
    .insert({
      ticket_id: ticket.id,
      sender_type: "client",
      sender_email: clientEmail,
      message,
      metadata: {
        ...ticketMetadata,
        client_name: clientName || null,
      },
    });

  if (messageError) {
    return {
      ok: false as const,
      status: 500,
      error: messageError.message,
    };
  }

  let acknowledgementSent = false;

  try {
    acknowledgementSent = await sendClientAcknowledgement(clientEmail);
  } catch (emailError) {
    console.warn("Ticket support créé, accusé de réception non envoyé :", {
      ticketId: ticket.id,
      error: emailError instanceof Error ? emailError.message : String(emailError),
    });
  }

  return {
    ok: true as const,
    ticketId: ticket.id as string,
    acknowledgementSent,
  };
}
