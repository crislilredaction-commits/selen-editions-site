"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import LoadingMascot from "@/components/ui/LoadingMascot";

type Profile = {
  id: string;
  display_name?: string | null;
  professional_email?: string | null;
  phone?: string | null;
  engagement_type?: string | null;
  biography?: string | null;
  specialties?: string[] | null;
  cv_updated_at?: string | null;
};

const inputClass = "w-full border border-[#b28a62]/45 bg-[#fffdf8] px-3 py-2.5 text-[#3e2a1f] outline-none transition focus:border-[#8a4b24] focus:ring-2 focus:ring-[#8a4b24]/10";

export default function TrainerHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [exempt, setExempt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/client/daily/trainer-profile", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error ?? "Profil indisponible.");
      else {
        setProfile(body.profile ?? null);
        setExempt(Boolean(body.annual_review_exempt));
      }
      setLoading(false);
    })();
  }, []);

  const specialtiesCount = profile?.specialties?.length ?? 0;
  const profileComplete = useMemo(() => {
    if (!profile) return 0;
    const checks = [profile.professional_email, profile.phone, profile.biography, specialtiesCount > 0 ? "ok" : ""];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [profile, specialtiesCount]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/client/daily/trainer-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        professional_email: form.get("professional_email"),
        phone: form.get("phone"),
        biography: form.get("biography"),
        specialties: String(form.get("specialties") || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) return setError(body.error ?? "Enregistrement impossible.");
    setProfile(body.profile);
    setExempt(Boolean(body.annual_review_exempt));
    setMessage("Votre profil formateur est enregistré.");
  }

  if (loading) return <LoadingMascot message="Sélion prépare votre profil formateur…" />;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 md:px-6 md:pt-8">
      <section className="gazette-card p-6 md:p-9">
        <div className="gazette-band" />
        <div className="grid gap-7 pt-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
          <div>
            <span className="gazette-label">Selen Daily · Espace formateur</span>
            <h1 className="mt-5 font-['Playfair_Display'] text-4xl font-bold leading-[1.02] text-[#3e2a1f] md:text-6xl">
              {profile?.display_name || "Mon espace formateur"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[#5a4031] md:text-lg">
              Retrouvez vos sessions, vos validations et vos informations professionnelles dans un espace construit sur la même logique que Daily.
            </p>
          </div>
          <div className="border border-[#b28a62]/45 bg-[#efe3cf]/70 px-5 py-4 text-center">
            <strong className="block font-['Playfair_Display'] text-4xl text-[#8a4b24]">{profileComplete}%</strong>
            <span className="mt-1 block font-['Cinzel'] text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[#8a6243]">Profil complété</span>
          </div>
        </div>
      </section>

      {error ? <div className="mt-5 border border-[#8a4b24] bg-[#f8efdf] p-4 text-[#8a4b24]">{error}</div> : null}
      {message ? <div className="mt-5 border border-[#78915f] bg-[#f4faed] p-4 text-[#49643e]">{message}</div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-6">
          {profile ? (
            <form onSubmit={save} className="gazette-card p-5 md:p-7">
              <div className="gazette-band" />
              <div className="pt-2">
                <span className="gazette-label">Profil professionnel</span>
                <h2 className="mt-4 text-3xl font-bold text-[#3e2a1f]">Vos informations formateur</h2>
                <p className="mt-2 max-w-2xl leading-6 text-[#5a4031]">Ces informations peuvent évoluer à tout moment. Elles servent à garder votre profil professionnel à jour sans imposer de liste de compétences artificielle.</p>
              </div>

              <div className="mt-6 grid gap-5">
                <label className="grid gap-2">
                  <span className="font-bold text-[#3e2a1f]">Compétences / spécialités</span>
                  <textarea name="specialties" rows={7} defaultValue={(profile.specialties ?? []).join("\n")} placeholder="Décrivez librement vos compétences, une par ligne si vous le souhaitez…" className={inputClass} />
                  <small className="text-[#6e4a32]">Expression libre : aucune liste imposée.</small>
                </label>

                <label className="grid gap-2">
                  <span className="font-bold text-[#3e2a1f]">Présentation / expérience</span>
                  <textarea name="biography" rows={8} defaultValue={profile.biography ?? ""} placeholder="Parcours, expériences, domaines d’intervention, méthodes…" className={inputClass} />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="font-bold text-[#3e2a1f]">Email professionnel</span>
                    <input name="professional_email" type="email" defaultValue={profile.professional_email ?? ""} className={inputClass} />
                  </label>
                  <label className="grid gap-2">
                    <span className="font-bold text-[#3e2a1f]">Téléphone</span>
                    <input name="phone" defaultValue={profile.phone ?? ""} className={inputClass} />
                  </label>
                </div>
              </div>

              <div className="mt-6 border-t border-[#b28a62]/30 pt-5">
                <button disabled={saving} className="border border-[#8a4b24] bg-[#8a4b24] px-4 py-2.5 font-['Cinzel'] text-[0.66rem] font-bold uppercase tracking-[0.1em] text-white transition hover:bg-[#713c1d] disabled:opacity-60">
                  {saving ? "Enregistrement…" : "Enregistrer mon profil"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <aside className="grid content-start gap-5">
          <section className="gazette-card p-5">
            <div className="gazette-band" />
            <span className="gazette-label">Accès rapide</span>
            <h2 className="mt-4 text-2xl font-bold text-[#3e2a1f]">Votre activité</h2>
            <div className="mt-4 grid gap-2">
              <TrainerLink href="/client/daily/candidatures" title="Candidatures à valider" detail="Décisions qui attendent votre intervention" />
              <TrainerLink href="/client/daily/formateur/suivi-sessions" title="Mes sessions" detail="Planning, présences et suivi" />
              <TrainerLink href="/client/daily/formateur/cv" title="Mon CV" detail="Maintenir votre parcours à jour" />
              <TrainerLink href="/client/daily/formateur/certifications" title="Mes certifications" detail="Justificatifs et échéances" />
              {!exempt ? <TrainerLink href="/client/daily/formateur/suivi-annuel" title="Mon suivi annuel" detail="Auto-évaluation et suivi professionnel" /> : null}
            </div>
          </section>

          {exempt ? (
            <section className="border border-[#78915f]/55 bg-[#f4faed] p-5 text-[#49643e]">
              <span className="font-['Cinzel'] text-[0.6rem] font-bold uppercase tracking-[0.12em]">Suivi annuel</span>
              <p className="mt-2 text-sm leading-6">Dirigeant-formateur : l’auto-évaluation annuelle n’est pas requise pour votre profil.</p>
            </section>
          ) : null}

          <section className="border border-[#b28a62]/35 bg-[#fffaf0]/55 p-5">
            <span className="gazette-label">Repère</span>
            <p className="mt-3 text-sm leading-6 text-[#5a4031]">Vos droits et vos actions métier ne changent pas : cette évolution harmonise uniquement l’accueil et la navigation avec l’identité visuelle de Daily.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function TrainerLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="grid grid-cols-[1fr_auto] items-center gap-3 border border-[#b28a62]/35 bg-[#fffaf0]/55 px-4 py-3 text-[#3e2a1f] no-underline transition hover:bg-[#efe3cf]/65">
      <span>
        <strong className="block">{title}</strong>
        <small className="mt-1 block leading-5 text-[#6e4a32]">{detail}</small>
      </span>
      <span className="text-[#8a4b24]">→</span>
    </Link>
  );
}
