"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

type LoginMode = "client" | "agent";

export default function ClientLoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [mode, setMode] = useState<LoginMode>("client");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setMessage(
        "Connexion impossible. Vérifiez votre email et votre mot de passe.",
      );
      setLoading(false);
      return;
    }

    if (mode === "agent") {
      const { data: agentData, error: agentError } = await supabase
        .from("agent_profiles")
        .select("email, role, is_active")
        .eq("email", normalizedEmail)
        .eq("is_active", true)
        .maybeSingle();

      if (agentError) {
        setMessage(
          `Connexion réussie, mais impossible de vérifier l’accès agent : ${agentError.message}`,
        );
        setLoading(false);
        return;
      }

      if (!agentData) {
        setMessage(
          "Ce compte est connecté, mais il n’a pas d’accès agent actif.",
        );
        setLoading(false);
        return;
      }

      router.push("/agent/audits-blancs");
      setLoading(false);
      return;
    }

    router.push("/client");
    setLoading(false);
  };

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto max-w-5xl px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-cta px-6 md:px-10 py-10 md:py-14">
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <p className="gazette-label">Connexion</p>

            <h1
              className="gazette-hero-title"
              style={{
                color: "var(--parchment)",
                marginBottom: "0.6rem",
              }}
            >
              Accéder au bureau Selen
            </h1>

            <p
              style={{
                color: "var(--sepia-mid)",
                lineHeight: 1.65,
                maxWidth: 680,
                margin: "0 auto",
              }}
            >
              Choisissez votre espace, puis connectez-vous avec l’adresse email
              utilisée lors de votre achat ou fournie par Selen.
            </p>
          </div>
        </div>

        <div
          style={{
            marginTop: "1.5rem",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "1rem",
          }}
          className="preaudit-grid"
        >
          <button
            type="button"
            onClick={() => setMode("client")}
            style={{
              border: "1px solid var(--sepia-mid)",
              borderLeft:
                mode === "client"
                  ? "4px solid var(--ocre-gold)"
                  : "1px solid var(--sepia-mid)",
              background:
                mode === "client" ? "rgba(201,160,85,0.14)" : "var(--paper)",
              padding: "1rem",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <p className="gazette-label">Client</p>
            <h2 style={{ color: "var(--ink)", marginTop: "0.35rem" }}>
              Le bureau Selen
            </h2>
            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                marginTop: "0.35rem",
              }}
            >
              Auto-audit, audit blanc, rapports et documents transmis.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("agent")}
            style={{
              border: "1px solid var(--sepia-mid)",
              borderLeft:
                mode === "agent"
                  ? "4px solid var(--ocre-gold)"
                  : "1px solid var(--sepia-mid)",
              background:
                mode === "agent" ? "rgba(201,160,85,0.14)" : "var(--paper)",
              padding: "1rem",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <p className="gazette-label">Agent</p>
            <h2 style={{ color: "var(--ink)", marginTop: "0.35rem" }}>
              Espace agent
            </h2>
            <p
              style={{
                color: "var(--ink-faint)",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                marginTop: "0.35rem",
              }}
            >
              Gestion des dossiers, audits blancs, rapports et documents.
            </p>
          </button>
        </div>

        <section
          style={{
            marginTop: "1.2rem",
            background: "var(--paper)",
            border: "1px solid var(--sepia-mid)",
            padding: "1.4rem",
          }}
        >
          <p className="gazette-label">
            {mode === "agent" ? "Connexion agent" : "Connexion client"}
          </p>

          <h2 style={{ color: "var(--ink)", marginBottom: "0.7rem" }}>
            {mode === "agent"
              ? "Accéder à l’espace agent"
              : "Accéder au bureau Selen"}
          </h2>

          <form onSubmit={handleLogin} style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              Email
              <input
                type="email"
                placeholder="votre@email.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              Mot de passe
              <input
                type="password"
                placeholder="Votre mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
                  ? "Connexion..."
                  : mode === "agent"
                    ? "Entrer dans l’espace agent"
                    : "Entrer dans le bureau Selen"}
              </span>
            </button>
          </form>

          {message && (
            <div
              style={{
                marginTop: "1rem",
                border: "1px solid var(--rust)",
                borderLeft: "4px solid var(--rust)",
                background: "rgba(138,75,36,0.06)",
                padding: "0.9rem",
                color: "var(--rust)",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          <div
            style={{
              marginTop: "1.2rem",
              borderTop: "1px solid var(--sepia-mid)",
              paddingTop: "1rem",
              display: "grid",
              gap: "0.55rem",
              color: "var(--ink-faint)",
              fontSize: "0.9rem",
              lineHeight: 1.5,
            }}
          >
            <p>
              Si vous venez d’acheter une prestation, un email de connexion peut
              vous être envoyé automatiquement. Pensez à vérifier vos courriers
              indésirables : le message peut apparaître comme envoyé par
              Supabase.
            </p>

            <p>
              Si vous ne retrouvez pas votre accès, retournez vers{" "}
              <a
                href="/client"
                style={{ color: "var(--ocre-dark)", fontWeight: 700 }}
              >
                le bureau Selen
              </a>
              {" "}pour utiliser le bouton Prévenir Selen.
            </p>

            <Link
              href="/client"
              style={{
                color: "var(--ocre-dark)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Retourner au bureau Selen
            </Link>
          </div>
        </section>
      </section>

      <Footer />
    </main>
  );
}
