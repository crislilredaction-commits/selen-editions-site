"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type LinkStatus = "checking" | "ready" | "invalid";

export default function ConfirmRecoveryPage() {
  const router = useRouter();
  const initialized = useRef(false);
  const tokenHash = useRef<string | null>(null);
  const [status, setStatus] = useState<LinkStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUrl = new URL(window.location.href);
    const recoveryToken = currentUrl.searchParams.get("token_hash");
    const recoveryType = currentUrl.searchParams.get("type");

    window.history.replaceState({}, document.title, currentUrl.pathname);

    if (!recoveryToken || recoveryType !== "recovery") {
      setStatus("invalid");
      setMessage("Ce lien de réinitialisation est invalide ou incomplet. Demandez un nouveau lien.");
      return;
    }

    tokenHash.current = recoveryToken;
    setStatus("ready");
  }, []);

  async function handleConfirm() {
    const recoveryToken = tokenHash.current;
    if (!recoveryToken || loading) return;

    setLoading(true);
    setMessage("");

    const supabase = createSupabaseBrowserClient({
      detectSessionInUrl: false,
      isSingleton: false,
    });

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

    router.replace("/client/nouveau-mot-de-passe");
  }

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />
      <section className="mx-auto max-w-2xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-12">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Accès Selen</p>
            <h1 className="gazette-hero-title" style={{ color: "var(--parchment)", marginBottom: "0.6rem" }}>Confirmer la réinitialisation</h1>
            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.65 }}>Une dernière vérification protège votre lien avant de choisir un nouveau mot de passe.</p>
          </div>
        </div>

        <section style={{ marginTop: "1.2rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.4rem" }}>
          {status === "checking" ? <p role="status">Vérification du lien…</p> : null}

          {status === "ready" ? (
            <>
              <p style={{ lineHeight: 1.6, marginBottom: "1rem" }}>Cliquez sur le bouton pour vérifier le lien et accéder au formulaire sécurisé.</p>
              <button type="button" onClick={handleConfirm} disabled={loading} className="btn-ink" style={{ width: "100%", opacity: loading ? 0.55 : 1, cursor: loading ? "not-allowed" : "pointer" }}>
                <span>{loading ? "Vérification…" : "Continuer"}</span>
              </button>
            </>
          ) : null}

          {message ? <div role="status" style={{ border: "1px solid var(--rust)", borderLeft: "4px solid var(--rust)", background: "rgba(138,75,36,0.06)", padding: "0.9rem", color: "var(--rust)", lineHeight: 1.5 }}>{message}</div> : null}

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
