"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function UpdatePasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Vérification du lien de réinitialisation…");

  useEffect(() => {
    let active = true;

    async function prepareRecoverySession() {
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get("code");
      const hashParams = new URLSearchParams(currentUrl.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setMessage("Ce lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.");
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!active) return;
        if (error) {
          setMessage("Ce lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.");
          return;
        }
      }

      if (code || (accessToken && refreshToken)) {
        window.history.replaceState({}, document.title, currentUrl.pathname);
      }

      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setSessionReady(true);
        setMessage("");
      } else {
        setMessage("Ce lien de réinitialisation est invalide ou a expiré. Demandez un nouveau lien.");
      }
    }

    void prepareRecoverySession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        setSessionReady(true);
        setMessage("");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage("Impossible de modifier le mot de passe. Le lien a peut-être expiré ; demandez un nouveau lien.");
      return;
    }

    setSuccess(true);
    setMessage("Votre mot de passe a été modifié. Vous pouvez maintenant vous reconnecter à Selen.");
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-2xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-12">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Accès Selen</p>
            <h1 className="gazette-hero-title" style={{ color: "var(--parchment)", marginBottom: "0.6rem" }}>Choisir un nouveau mot de passe</h1>
          </div>
        </div>

        <section style={{ marginTop: "1.2rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.4rem" }}>
          {!success && sessionReady ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
              <label style={{ display: "grid", gap: "0.35rem" }}>Nouveau mot de passe<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.6)", color: "var(--ink)" }} /></label>
              <label style={{ display: "grid", gap: "0.35rem" }}>Confirmer le mot de passe<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.6)", color: "var(--ink)" }} /></label>
              <button type="submit" disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}><span>{loading ? "Modification…" : "Enregistrer le nouveau mot de passe"}</span></button>
            </form>
          ) : null}

          {message && <div role="status" style={{ marginTop: sessionReady && !success ? "1rem" : 0, border: "1px solid var(--sepia-mid)", borderLeft: `4px solid ${success ? "var(--ocre-gold)" : "var(--rust)"}`, background: "rgba(201,160,85,0.08)", padding: "0.9rem", color: "var(--ink)", lineHeight: 1.5 }}>{message}</div>}

          <div style={{ marginTop: "1.2rem", borderTop: "1px solid var(--sepia-mid)", paddingTop: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link href="/client/login" style={{ color: "var(--ocre-dark)", fontWeight: 700, textDecoration: "none" }}>Retour à la connexion</Link>
            {!sessionReady && <Link href="/client/mot-de-passe-oublie" style={{ color: "var(--ocre-dark)", fontWeight: 700, textDecoration: "none" }}>Demander un nouveau lien</Link>}
          </div>
        </section>
      </section>
      <Footer />
    </main>
  );
}
