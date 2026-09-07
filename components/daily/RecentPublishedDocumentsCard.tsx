"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";

type PublishedDocument = {
  id: string;
  document_type: string;
  logical_name: string | null;
  published_at: string | null;
};

const typeLabels: Record<string, string> = {
  training_program: "Programme de formation",
  training_agreement: "Convention de formation",
  convocation: "Convocation",
  registration_positioning: "Dossier d’inscription et positionnement",
  attendance_sheet: "Feuille d’émargement",
  training_certificate: "Attestation de formation",
  completion_certificate: "Certificat de réalisation",
  assessment: "Évaluation",
};

function formatDate(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export default function RecentPublishedDocumentsCard() {
  const [documents, setDocuments] = useState<PublishedDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    assistanceFetch("/api/client/daily/recent-published-documents", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { documents: [] };
        return response.json().catch(() => ({ documents: [] }));
      })
      .then((payload) => {
        if (!cancelled) setDocuments(Array.isArray(payload?.documents) ? payload.documents : []);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (documents.length === 0) return null;

  return (
    <section style={{ maxWidth: 1180, margin: "1rem auto 0", padding: "0 1.25rem" }} aria-label="Documents récemment publiés">
      <div style={{ border: "1px solid var(--selen-border)", borderRadius: 16, padding: "1rem 1.1rem", background: "var(--selen-bg2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <strong>📄 Nouveaux documents disponibles</strong>
            <p style={{ margin: ".35rem 0 0", color: "var(--selen-text2)", fontSize: 14 }}>
              Retrouvez ici les documents publiés pour votre organisme au cours des 30 derniers jours.
            </p>
          </div>
          <Link href="/client/daily/documents">Voir les documents</Link>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {documents.slice(0, 3).map((document) => (
            <div key={document.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, flexWrap: "wrap" }}>
              <span>{document.logical_name?.trim() || typeLabels[document.document_type] || "Document"}</span>
              <span style={{ color: "var(--selen-text2)" }}>{formatDate(document.published_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
