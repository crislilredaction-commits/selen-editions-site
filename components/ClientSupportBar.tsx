"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type ClientSupportBarProps = {
  email?: string | null;
  clientName?: string | null;
  context?: string;
  dossierId?: string | null;
  toolSlug?: string | null;
};

export default function ClientSupportBar({
  email,
  clientName,
  context = "auto-audit Qualiopi",
  dossierId,
  toolSlug,
}: ClientSupportBarProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [senderEmail, setSenderEmail] = useState(email ?? "");
  const [senderName, setSenderName] = useState(clientName ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSenderEmail((current) => current || email || "");
  }, [email]);

  useEffect(() => {
    setSenderName((current) => current || clientName || "");
  }, [clientName]);

  useEffect(() => {
    async function prefillClientIdentity() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) return;

      setSenderEmail((current) => current || user.email || "");
      setSenderName(
        (current) =>
          current ||
          String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? ""),
      );
    }

    prefillClientIdentity();
  }, [supabase]);

  async function sendSupportMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSent(false);

    if (!message.trim()) {
      setError("Ajoutez un message avant d'envoyer.");
      return;
    }

    setSending(true);

    const pageUrl =
      typeof window !== "undefined" ? window.location.href : "Page inconnue";
    const clientEmail = senderEmail || email || "";

    try {
      const response = await fetch("/api/support/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName: senderName || null,
          clientEmail,
          subject: `Prévenir Selen - ${context}`,
          category: "question",
          context,
          dossierId,
          toolSlug,
          pageUrl,
          message,
          metadata: {
            source: "client_support_bar",
            page_url: pageUrl,
            dossier_id: dossierId || null,
            tool_slug: toolSlug || null,
          },
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "Impossible d'envoyer le message.");
      }

      setMessage("");
      setSent(true);
      setIsOpen(false);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Impossible d'envoyer le message.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(178,138,98,0.35)",
        background: "rgba(248,239,223,0.82)",
        padding: "0.75rem 1rem",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: "0.88rem",
            lineHeight: 1.4,
          }}
        >
          Un bug, une difficulté ou une question pendant l'utilisation ?
        </p>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link
            href="/prendre-rendez-vous?source=client_space"
            className="btn-ink"
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: "0.82rem",
              textDecoration: "none",
            }}
          >
            <span>Réserver un appel</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              setIsOpen((current) => !current);
              setError("");
              setSent(false);
            }}
            className="btn-ink"
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: "0.82rem",
            }}
          >
            <span>Prévenir Selen</span>
          </button>
        </div>
      </div>

      {isOpen ? (
        <form
          onSubmit={sendSupportMessage}
          style={{
            maxWidth: 1180,
            margin: "0.75rem auto 0",
            display: "grid",
            gap: "0.55rem",
          }}
        >
          {!senderName ? (
            <input
              type="text"
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              placeholder="Votre nom ou organisme"
              style={{
                padding: "0.6rem",
                border: "1px solid var(--sepia-mid)",
                background: "rgba(255,255,255,0.65)",
              }}
            />
          ) : null}

          {!email && !senderEmail ? (
            <input
              type="email"
              required
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
              placeholder="Votre email"
              style={{
                padding: "0.6rem",
                border: "1px solid var(--sepia-mid)",
                background: "rgba(255,255,255,0.65)",
              }}
            />
          ) : null}

          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Décrivez votre difficulté ou votre demande..."
            style={{
              minHeight: "92px",
              padding: "0.6rem",
              border: "1px solid var(--sepia-mid)",
              background: "rgba(255,255,255,0.65)",
              resize: "vertical",
            }}
          />

          {error ? (
            <p style={{ color: "var(--rust)", fontSize: "0.86rem" }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="submit"
              className="btn-ink"
              disabled={sending}
              style={{ padding: "0.45rem 0.8rem", fontSize: "0.82rem" }}
            >
              <span>{sending ? "Envoi..." : "Envoyer à Selen"}</span>
            </button>

            <button
              type="button"
              className="btn-ghost"
              onClick={() => setIsOpen(false)}
              style={{ padding: "0.45rem 0.8rem", fontSize: "0.82rem" }}
            >
              <span>Fermer</span>
            </button>
          </div>
        </form>
      ) : null}

      {sent ? (
        <p
          style={{
            maxWidth: 1180,
            margin: "0.65rem auto 0",
            color: "#4f6f36",
            fontSize: "0.86rem",
          }}
        >
          Votre demande a bien été transmise à Selen. Vous recevrez une réponse
          par email.
        </p>
      ) : null}
    </div>
  );
}
