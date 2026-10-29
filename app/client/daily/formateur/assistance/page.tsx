"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

type TrainerPortal = {
  id: string;
  trainerName: string;
  trainerEmail: string | null;
  sessionId: string;
  sessionLabel: string;
  startDate: string | null;
  endDate: string | null;
  accessStatus: string | null;
  lastOpenedAt: string | null;
};
type TrainerSpace = { trainerId:string; trainerName:string; trainerEmail:string|null; sessionId:string; sessionLabel:string; startDate:string|null; endDate:string|null };

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function AssistedTrainerPortalChooser() {
  const [portals, setPortals] = useState<TrainerPortal[]>([]);
  const [spaces, setSpaces] = useState<TrainerSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void assistanceFetch("/api/client/daily/assisted-trainer-workspace", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? "Espaces formateurs indisponibles.");
        if (!cancelled) setSpaces(body.spaces ?? []);
        if ((body.spaces ?? []).length === 0) {
          const legacy = await assistanceFetch("/api/client/daily/assisted-trainer-portals", { cache: "no-store" });
          const legacyBody = await legacy.json().catch(() => ({}));
          if (!legacy.ok) throw new Error(legacyBody.error ?? "Espaces formateurs indisponibles.");
          if (!cancelled) setPortals(legacyBody.portals ?? []);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Espaces formateurs indisponibles.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function openPortal(portalAccessId: string) {
    if (openingId) return;
    setOpeningId(portalAccessId);
    setError("");
    try {
      const response = await assistanceFetch("/api/client/daily/assisted-trainer-portals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalAccessId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.url) {
        throw new Error(body.error ?? "Impossible d’ouvrir cet espace formateur.");
      }
      window.location.assign(body.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’ouvrir cet espace formateur.");
      setOpeningId("");
    }
  }

  if (loading) {
    return <LoadingMascot message="Sélion recherche les espaces formateurs de cet OF…" />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-6 md:px-6 md:pt-8">
      <section className="gazette-card p-6 md:p-9">
        <div className="gazette-band" />
        <span className="gazette-label">Mode assistance Studio</span>
        <h1 className="mt-5 font-['Playfair_Display'] text-4xl font-bold text-[#3e2a1f] md:text-5xl">
          Choisir l’espace formateur
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#5a4031]">
          Sélectionnez explicitement le formateur et la session à consulter pour cet organisme.
          La vue ouverte est bornée à ce seul accès délégué et reste en lecture seule.
        </p>
      </section>

      {error ? (
        <div role="alert" className="mt-5 border border-[#8a4b24] bg-[#f8efdf] p-4 text-[#8a4b24]">
          {error}
        </div>
      ) : null}

      {spaces.length > 0 ? <section aria-label="Sessions des formateurs de cet organisme" className="mt-6 grid gap-4 md:grid-cols-2">{spaces.map(space => <article key={`${space.trainerId}:${space.sessionId}`} className="gazette-card grid gap-4 p-6"><h2 className="text-2xl font-bold">{space.trainerName}</h2><p>{space.trainerEmail}</p><strong>{space.sessionLabel}</strong><p>{formatDate(space.startDate)}{space.endDate ? ` → ${formatDate(space.endDate)}` : ""}</p><Link className="underline" href={`/client/daily/formateur/assistance/session?trainer_id=${encodeURIComponent(space.trainerId)}&session_id=${encodeURIComponent(space.sessionId)}`}>Ouvrir le suivi de cette session</Link></article>)}</section> : portals.length === 0 ? (
        <section className="gazette-card mt-6 p-6 md:p-8">
          <h2 className="text-2xl font-bold text-[#3e2a1f]">Aucun espace formateur délégué</h2>
          <p className="mt-3 leading-7 text-[#5a4031]">
            Cet organisme ne possède actuellement aucun accès formateur actif. Aucun profil personnel
            de l’agent Studio n’a été utilisé à la place.
          </p>
          <Link href="/client/daily" className="mt-5 inline-flex text-[#8a4b24] underline underline-offset-4">
            Retour au tableau de bord Daily
          </Link>
        </section>
      ) : (
        <section aria-label="Espaces formateurs disponibles" className="mt-6 grid gap-4 md:grid-cols-2">
          {portals.map((portal) => {
            const start = formatDate(portal.startDate);
            const end = formatDate(portal.endDate);
            const opening = openingId === portal.id;
            return (
              <article key={portal.id} className="gazette-card grid content-between gap-5 p-5 md:p-6">
                <div>
                  <span className="gazette-label">Formateur · {portal.accessStatus || "accès actif"}</span>
                  <h2 className="mt-3 text-2xl font-bold text-[#3e2a1f]">{portal.trainerName}</h2>
                  {portal.trainerEmail ? <p className="mt-1 break-all text-[#6e4a32]">{portal.trainerEmail}</p> : null}
                  <div className="mt-4 border-l-2 border-[#b28a62] pl-4">
                    <strong className="block text-[#3e2a1f]">{portal.sessionLabel}</strong>
                    {start || end ? (
                      <span className="mt-1 block text-sm text-[#6e4a32]">
                        {start || "Date à préciser"}{end ? ` → ${end}` : ""}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-sm text-[#6e4a32]">
                      {portal.lastOpenedAt ? "Accès déjà activé par le titulaire" : "Accès non encore ouvert par le titulaire"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void openPortal(portal.id)}
                  disabled={Boolean(openingId)}
                  className="border border-[#8a4b24] bg-[#8a4b24] px-4 py-3 font-['Cinzel'] text-[0.66rem] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[#713c1d] disabled:cursor-wait disabled:opacity-60"
                >
                  {opening ? "Ouverture…" : "Ouvrir cet espace"}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
