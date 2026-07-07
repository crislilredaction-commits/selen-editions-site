"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/client";
  }

  return value;
}

function ClientActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activationReady, setActivationReady] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = sanitizeNextPath(searchParams.get("next"));

  useEffect(() => {
    async function prepareSession() {
      setCheckingSession(true);
      setActivationReady(false);
      setMessage("");

      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      const otpType =
        type === "invite" || type === "recovery" ? (type as EmailOtpType) : null;

      if (tokenHash && otpType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType,
        });

        if (error) {
          setMessage(
            "Ce lien n’est plus valide ou a expiré. Contactez Selen pour recevoir un nouveau lien.",
          );
          setCheckingSession(false);
          return;
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage(
            "Ce lien n’est plus valide ou a expiré. Contactez Selen pour recevoir un nouveau lien.",
          );
          setCheckingSession(false);
          return;
        }
      } else if (typeof window !== "undefined" && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setMessage(
              "Ce lien n’est plus valide ou a expiré. Contactez Selen pour recevoir un nouveau lien.",
            );
            setCheckingSession(false);
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        setMessage(
          "Ce lien n’est plus valide ou a expiré. Contactez Selen pour recevoir un nouveau lien.",
        );
        setCheckingSession(false);
        return;
      }

      setActivationReady(true);
      setCheckingSession(false);
    }

    prepareSession();
  }, [searchParams, supabase]);

  async function handlePasswordCreation(event: React.FormEvent) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    if (password.length < 8) {
      setMessage("Votre mot de passe doit contenir au moins 8 caractères.");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setMessage(
        "Ce lien n’est plus valide ou a expiré. Contactez Selen pour recevoir un nouveau lien.",
      );
      setLoading(false);
      return;
    }

    setMessage("Votre mot de passe est créé. Nous ouvrons votre Bureau Selen.");
    window.setTimeout(() => {
      router.replace(nextPath);
      router.refresh();
    }, 900);
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-3xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-14">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Bureau Selen</p>

            <h1
              className="gazette-hero-title"
              style={{
                color: "var(--parchment)",
                marginBottom: "0.6rem",
              }}
            >
              Créez votre mot de passe Bureau Selen
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 620,
                margin: "0 auto",
              }}
            >
              Bienvenue dans votre Bureau Selen. Choisissez un mot de passe
              pour accéder à vos documents et suivre votre dossier.
            </p>
          </div>
        </div>

        <section
          style={{
            marginTop: "1.2rem",
            background: "var(--paper)",
            border: "1px solid var(--sepia-mid)",
            padding: "1.4rem",
          }}
        >
          {checkingSession ? (
            <p style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}>
              Vérification du lien d’activation...
            </p>
          ) : activationReady ? (
            <form
              onSubmit={handlePasswordCreation}
              style={{ display: "grid", gap: "1rem" }}
            >
              <label style={{ display: "grid", gap: "0.35rem" }}>
                Nouveau mot de passe
                <input
                  type="password"
                  placeholder="Au moins 8 caractères"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.6)",
                    color: "var(--ink)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: "0.35rem" }}>
                Confirmer le mot de passe
                <input
                  type="password"
                  placeholder="Retapez votre mot de passe"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid var(--sepia-mid)",
                    background: "rgba(255,255,255,0.6)",
                    color: "var(--ink)",
                  }}
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn-ink"
                style={{
                  width: "100%",
                  opacity: loading ? 0.55 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <span>
                  {loading
                    ? "Création du mot de passe..."
                    : "Créer mon mot de passe"}
                </span>
              </button>
            </form>
          ) : null}

          {message ? (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.9rem",
                border: "1px solid rgba(138,75,36,0.35)",
                background: "rgba(138,75,36,0.06)",
                color: "var(--rust)",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          ) : null}
        </section>
      </section>

      <Footer />
    </main>
  );
}

export default function ClientActivationPage() {
  return (
    <Suspense fallback={null}>
      <ClientActivationContent />
    </Suspense>
  );
}
