"use client";

import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type Communication = {
  id: string;
  communication_type: string;
  recipient_email: string;
  recipient_name?: string | null;
  subject: string;
  text_body: string;
  provider: string;
  provider_message_id?: string | null;
  status: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
};

const typeLabels: Record<string, string> = {
  attendance_reminder: "Relance d’émargement",
};

const statusLabels: Record<string, string> = {
  queued: "En préparation",
  sent: "Envoyé",
  delivered: "Livré",
  bounced: "Rejeté",
  failed: "Échec",
};

function formatDate(value?: string | null) {
  if (!value) return "Date indisponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function DailyCommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await assistanceFetch("/api/client/daily/communications", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? "Chargement impossible.");
      setCommunications(data.communications ?? []);
    })();
  }, []);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem 4rem", color: "#3f2b1d" }}>
      <p style={{ fontWeight: 800, color: "#8a4b24" }}>Selen Daily · Traçabilité</p>
      <h1>Communications envoyées</h1>
      <p>
        Cet historique conserve les communications métier envoyées par Daily. Il permet de retrouver le destinataire,
        l’horodatage, le contenu exact envoyé et l’identifiant technique du message lorsqu’il est disponible.
      </p>
      {error ? <p style={{ padding: 12, border: "1px solid #8a4b24" }}>{error}</p> : null}
      <section style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {communications.length === 0 && !error ? <p>Aucune communication tracée pour le moment.</p> : null}
        {communications.map((item) => (
          <article key={item.id} style={{ padding: 16, border: "1px solid #d8b989", background: "#fffaf0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <strong>{typeLabels[item.communication_type] ?? item.communication_type}</strong>
                <div style={{ marginTop: 5 }}>{item.subject}</div>
                <div style={{ fontSize: 13, marginTop: 5 }}>
                  À {item.recipient_name ? `${item.recipient_name} · ` : ""}{item.recipient_email}
                </div>
              </div>
              <div style={{ textAlign: "right", fontSize: 13 }}>
                <strong>{statusLabels[item.status] ?? item.status}</strong>
                <div>{formatDate(item.sent_at ?? item.failed_at)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
              style={{ marginTop: 12, padding: "7px 10px", fontWeight: 700 }}
            >
              {openId === item.id ? "Masquer la preuve" : "Voir la preuve"}
            </button>
            {openId === item.id ? (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(201,160,85,.08)", border: "1px solid #e4cfaa" }}>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{item.text_body}</pre>
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  Prestataire : {item.provider}
                  {item.provider_message_id ? ` · identifiant : ${item.provider_message_id}` : " · identifiant indisponible"}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
