"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type FlowStatus = "checking" | "confirm" | "password" | "success" | "invalid";

export default function ConfirmRecoveryPage() {
  const supabase = useMemo(
    () =>
      createSupabaseBrowserClient({
        detectSessionInUrl: false,
        isSingleton: false,
      }),
    [],
  );
  const initialized = useRef(false);
  const tokenHash = useRef<string | null>(null);
  const [status, setStatus] = useState<FlowStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUrl = new URL(window.location.href);
    const recoveryToken = currentUrl.searchParams.get("token_hash");
    const recoveryType = currentUrl.searchParams.get("type");

    // Retire immédiatement le jeton de l'historique et de la barre d'adresse.
    window.history.replaceState({}, document.title, currentUrl.pathname);

    if (!recoveryToken || recoveryType !== "recovery") {
      setStatus("invalid");
      setMessage("Ce lien de réinitialisation est invalide ou incomplet. Demandez un nouveau lien.");
      return;
    }

    tokenHash.current = recoveryToken;
    setStatus("confirm");
  }, []);

  async function handleConfirm() {
    const recoveryToken = tokenHash.current;
    if (!recoveryToken || loading) return;

    setLoading(true);
    setMessage("");

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: recoveryToken,
      type: "recovery",
    });

    if (error || !data.session) {
      tokenHash.current = null;
      setLoading(false);
      setStatus("invalid");
      setMessage("Ce lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.");
      return;
    }

    // Le lien n'est utile qu'une fois. À partir d'ici, on conserve la même
    // instance Supabase et sa session de récupération jusqu'au changement
    // effectif du mot de passe : aucune navigation intermédiaire.
    tokenHash.current = null;
    setLoading(false);
    setStatus("password");
    setMessage("");
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setMessage("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (password !== confirmation) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    setMessage("");

    // Rafraîchit explicitement la session juste avant l'opération sensible.
    // Cela évite qu'un access token court arrive à échéance pendant la saisie.
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      setLoading(false);
      setStatus("invalid");
      setMessage("La session de récupération n'est plus valide. Demandez un nouveau lien.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage("Impossible de modifier le mot de passe. Réessayez sans quitter cette page ou demandez un nouveau lien.");
      return;
    }

    setPassword("");
    setConfirmation("");
    setStatus("success");
    setMessage("Votre mot de passe a été modifié. Vous pouvez maintenant vous reconnecter à Selen.");
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-2xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-12">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Accès Selen</p>
            <h1 className="gazette-hero-title" style={{ color: "var(--parchment)", marginBottom: "0.6rem" }}>
              {status === "password" ? "Choisir un nouveau mot de passe" : "Confirmer la réinitialisation"}
            </h1>
            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>
              {status === "password"
                ? "La session est sécurisée. Choisissez maintenant votre nouveau mot de passe."
                : "Une dernière vérification protège votre lien avant de choisir un nouveau mot de passe."}
            </p>
          </div>
        </div>

        <section style={{ marginTop: "1.2rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.4rem" }}>
          {status === "checking" ? <p role="status">Vérification du lien…</p> : null}

          {status === "confirm" ? (
            <>
              <p style={{ lineHeight: 1.6, marginBottom: "1rem" }}>Cliquez sur le bouton pour vérifier le lien et ouvrir le formulaire sécurisé.</p>
              <button type="button" onClick={handleConfirm} disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                <span>{loading ? "Vérification…" : "Continuer"}</span>
              </button>
            </>
          ) : null}

          {status === "password" ? (
            <form onSubmit={handlePasswordSubmit} style={{ display: "grid", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                Nouveau mot de passe
                <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.6)", color: "var(--ink)" }} />
              </label>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                Confirmer le mot de passe
                <input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.6)", color: "var(--ink)" }} />
              </label>
              <button type="submit" disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                <span>{loading ? "Modification…" : "Enregistrer le nouveau mot de passe"}</span>
              </button>
            </form>
          ) : null}

          {message ? (
            <div role="status" style={{ marginTop: status === "password" ? "1rem" : 0, border: `1px solid ${status === "success" ? "var(--sepia-mid)" : "var(--rust)"}`, borderLeft: `4px solid ${status === "success" ? "var(--ocre-gold)" : "var(--rust)"}`, background: status === "success" ? "rgba(201,160,85,0.08)" : "rgba(138,75,36,0.06)", padding: "0.9rem", color: status === "success" ? "var(--ink)" : "var(--rust)", lineHeight: 1.5 }}>
              {message}
            </div>
          ) : null}

          <div style={{ marginTop: "1.2rem", borderTop: "1px solid var(--sepia-mid)", paddingTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link href="/client/login" style={{ color: "var(--ocre-dark)", fontWeight: 700, textDecoration: "none" }}>Retour à la connexion</Link>
            {status === "invalid" ? <Link href="/client/mot-de-passe-oublie" style={{ color: "var(--ocre-dark)", fontWeight: 700, textDecoration: "none" }}>Demander un nouveau lien</Link> : null}
          </div>
        </section>
      </section>
      <Footer />
    </main>
  );
}
