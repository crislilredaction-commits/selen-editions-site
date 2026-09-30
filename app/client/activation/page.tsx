"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/client";
  }

  return value;
}

function passwordErrorMessage(error: { code?: string }) {
  switch (error.code) {
    case "weak_password":
      return "Ce mot de passe est trop faible ou figure dans une liste de mots de passe connus. Choisissez-en un plus long avec majuscules, minuscules, chiffres et symbole, puis réessayez sur cette page.";
    case "same_password":
      return "Choisissez un mot de passe différent de l’ancien, puis réessayez sur cette page.";
    case "reauthentication_needed":
    case "reauthentication_not_valid":
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "Votre session d’activation n’est plus valide. Demandez un nouvel accès sécurisé à votre organisme de formation.";
    default:
      return "Le mot de passe n’a pas pu être enregistré. Réessayez sur cette page. Si le problème persiste, contactez Selen.";
  }
}

type ActivationCredentials = {
  tokenHash: string | null;
  otpType: EmailOtpType | null;
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

function ClientActivationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient({ detectSessionInUrl: false, isSingleton: false }), []);
  const initialized = useRef(false);
  const verifying = useRef(false);
  const credentials = useRef<ActivationCredentials | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activationReady, setActivationReady] = useState(false);
  const [confirmationReady, setConfirmationReady] = useState(false);
  const [message, setMessage] = useState("");

  const nextPath = sanitizeNextPath(searchParams.get("next"));
  const isLearner = /^\/daily\/portail\/(apprenant|learner)\//.test(nextPath);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const currentUrl = new URL(window.location.href);
    const type = currentUrl.searchParams.get("type");
    const hash = new URLSearchParams(currentUrl.hash.slice(1));
    const input: ActivationCredentials = {
      tokenHash: currentUrl.searchParams.get("token_hash"),
      otpType: type === "invite" || type === "recovery" ? type : null,
      code: currentUrl.searchParams.get("code"),
      accessToken: hash.get("access_token"),
      refreshToken: hash.get("refresh_token"),
    };
    credentials.current = input;
    // L’ouverture du mail ne consomme jamais le lien : la vérification
    // attend une action explicite, y compris pour les anciens liens.
    for (const key of ["token_hash", "type", "code"]) currentUrl.searchParams.delete(key);
    currentUrl.hash = "";
    window.history.replaceState({}, document.title, `${currentUrl.pathname}${currentUrl.search}`);
    if ((input.tokenHash && input.otpType) || input.code || (input.accessToken && input.refreshToken)) {
      setConfirmationReady(true);
    } else {
      setMessage("Ce lien d’activation est incomplet. Demandez un nouvel accès sécurisé à votre organisme de formation.");
    }
    setCheckingSession(false);
  }, []);

  async function handleConfirm() {
    const input = credentials.current;
    if (!input || verifying.current || activationReady) return;
    verifying.current = true;
    setLoading(true);
    setMessage("");
    try {
      const result = input.tokenHash && input.otpType
        ? await supabase.auth.verifyOtp({ token_hash: input.tokenHash, type: input.otpType })
        : input.code
          ? await supabase.auth.exchangeCodeForSession(input.code)
          : await supabase.auth.setSession({ access_token: input.accessToken!, refresh_token: input.refreshToken! });
      if (result.error || !result.data.session) {
        setConfirmationReady(false);
        setMessage("Ce lien a expiré ou a déjà été utilisé. Utilisez le dernier mail reçu, ou demandez un nouvel accès sécurisé à votre organisme de formation.");
        return;
      }
      credentials.current = null;
      setConfirmationReady(false);
      setActivationReady(true);
    } catch {
      setMessage("La vérification n’a pas abouti. Vérifiez votre connexion et réessayez.");
    } finally {
      verifying.current = false;
      setLoading(false);
    }
  }

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

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session) {
      setMessage("Votre session d’activation n’est plus valide. Demandez un nouvel accès sécurisé à votre organisme de formation.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
      data: { selen_password_configured: true },
    });

    if (error) {
      setMessage(passwordErrorMessage(error));
      setLoading(false);
      return;
    }

    setMessage(isLearner ? "Votre mot de passe est créé. Nous ouvrons votre espace apprenant." : "Votre mot de passe est créé. Nous ouvrons votre Bureau Selen.");
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
            <p className="gazette-label">{isLearner ? "Espace apprenant Selen" : "Bureau Selen"}</p>

            <h1
              className="gazette-hero-title"
              style={{
                color: "var(--parchment)",
                marginBottom: "0.6rem",
              }}
            >
              {isLearner ? "Activez votre espace apprenant" : "Créez votre mot de passe Bureau Selen"}
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 620,
                margin: "0 auto",
              }}
            >
              {isLearner ? "Confirmez votre accès, puis choisissez un mot de passe pour retrouver vos documents et votre formation." : "Confirmez votre accès, puis choisissez un mot de passe pour accéder à vos documents et suivre votre dossier."}
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
          ) : confirmationReady ? (
            <>
              <p style={{ color: "var(--ink)", lineHeight: 1.6, marginBottom: "1rem" }}>Cliquez sur le bouton pour ouvrir le formulaire de création de votre mot de passe.</p>
              <button type="button" onClick={handleConfirm} disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1 }}>
                <span>{loading ? "Vérification…" : "Activer mon accès"}</span>
              </button>
            </>
          ) : activationReady ? (
            <form
              onSubmit={handlePasswordCreation}
              style={{ display: "grid", gap: "1rem" }}
            >
              <label style={{ display: "grid", gap: "0.35rem" }}>
                Nouveau mot de passe
                <input
                  type="password"
                  autoComplete="new-password"
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
                  autoComplete="new-password"
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

              <p style={{ color: "var(--ink-soft)", lineHeight: 1.5 }}>Conseil : choisissez 12 caractères ou plus avec majuscule, minuscule, chiffre et symbole. Évitez les mots de passe courants.</p>
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
