"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

const GENERIC_SUCCESS = "Si un compte Selen correspond à cette adresse, un email de réinitialisation vient d’être envoyé. Pensez à vérifier vos courriers indésirables.";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsError(false);

    const normalizedEmail = email.trim().toLowerCase();
    const redirectTo = `${window.location.origin}/client/confirmer-recuperation`;

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (error) {
        setIsError(true);
        setMessage("L’envoi du lien de réinitialisation est momentanément indisponible. Réessayez dans quelques instants.");
      } else {
        setMessage(GENERIC_SUCCESS);
      }
    } catch {
      setIsError(true);
      setMessage("L’envoi du lien de réinitialisation est momentanément indisponible. Réessayez dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-2xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-12">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Accès Selen</p>
            <h1 className="gazette-hero-title" style={{ color: "var(--parchment)", marginBottom: "0.6rem" }}>Réinitialiser votre mot de passe</h1>
            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>Indiquez l’adresse email utilisée pour votre compte Selen.</p>
          </div>
        </div>

        <section style={{ marginTop: "1.2rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.4rem" }}>
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Email
              <input type="email" autoComplete="email" placeholder="votre@email.fr" value={email} onChange={(event) => setEmail(event.target.value)} required style={{ width: "100%", padding: "0.75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,0.6)", color: "var(--ink)" }} />
            </label>
            <button type="submit" disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
              <span>{loading ? "Envoi…" : "Recevoir le lien de réinitialisation"}</span>
            </button>
          </form>

          {message && <div role="status" style={{ marginTop: "1rem", border: `1px solid ${isError ? "var(--rust)" : "var(--sepia-mid)"}`, borderLeft: `4px solid ${isError ? "var(--rust)" : "var(--ocre-gold)"}`, background: isError ? "rgba(138,75,36,0.06)" : "rgba(201,160,85,0.08)", padding: "0.9rem", color: isError ? "var(--rust)" : "var(--ink)", lineHeight: 1.5 }}>{message}</div>}

          <div style={{ marginTop: "1.2rem", borderTop: "1px solid var(--sepia-mid)", paddingTop: "1rem" }}>
            <Link href="/client/login" style={{ color: "var(--ocre-dark)", fontWeight: 700, textDecoration: "none" }}>Retour à la connexion</Link>
          </div>
        </section>
      </section>
      <Footer />
    </main>
  );
}
