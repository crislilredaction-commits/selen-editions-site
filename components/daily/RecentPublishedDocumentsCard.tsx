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
    <section className="mx-auto max-w-6xl px-4 pt-5 md:px-6" aria-label="Documents récemment publiés">
      <article className="gazette-card p-5 md:p-6">
        <div className="gazette-band" />
        <div className="pt-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="gazette-label">Nouveaux documents disponibles</span>
              <h2 className="mt-4 font-['Playfair_Display'] text-2xl font-bold text-[#3e2a1f] md:text-3xl">Vos nouveautés documentaires</h2>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-6 text-[#5a4031]">
                Les documents publiés pour votre organisme au cours des 30 derniers jours sont regroupés ici.
              </p>
            </div>
            <Link href="/client/daily/documents" className="btn-ink inline-flex items-center text-center no-underline">
              <span>Voir les documents</span>
            </Link>
          </div>

          <div className="mt-5 divide-y divide-[#b28a62]/25 border-y border-[#b28a62]/30">
            {documents.slice(0, 3).map((document) => (
              <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="font-semibold text-[#3e2a1f]">
                  {document.logical_name?.trim() || typeLabels[document.document_type] || "Document"}
                </span>
                <span className="font-['Cinzel'] text-[0.62rem] uppercase tracking-[0.12em] text-[#8a6243]">
                  {formatDate(document.published_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}
