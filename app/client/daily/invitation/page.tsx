"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

export default function DailyInvitationPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
    setTokenReady(true);
    void supabase.auth.getUser().then(({ data }) => {
      setAuthenticated(Boolean(data.user));
      setEmail(data.user?.email ?? "");
      setBusy(false);
    });
  }, [supabase]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (loginError) { setError("Connexion impossible. Vérifiez votre email et votre mot de passe."); return; }
    setAuthenticated(true);
  }

  async function accept() {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/client/daily/workspace/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setError(data?.error ?? "L’invitation n’a pas pu être acceptée."); return; }
    setAccepted(true);
    setMessage("Invitation acceptée. Votre accès à l’organisme est maintenant actif.");
  }

  if (!tokenReady) {
    return <main className="gazette-paper" style={s.page}><section style={s.card}><p>Ouverture de l’invitation...</p></section></main>;
  }

  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return <main className="gazette-paper" style={s.page}><section style={s.card}><p className="gazette-label">Selen Daily</p><h1 style={s.title}>Invitation invalide</h1><p>Ce lien ne contient pas de jeton d’invitation valide.</p><Link href="/client" className="btn-ink"><span>Retour au bureau Selen</span></Link></section></main>;
  }

  return (
    <main className="gazette-paper" style={s.page}>
      <section className="gazette-cta" style={s.hero}>
        <p className="gazette-label">Selen Daily</p>
        <h1 className="gazette-hero-title">Rejoindre un organisme</h1>
        <p style={{ color: "var(--sepia-mid)" }}>L’invitation est liée à l’adresse email qui l’a reçue et n’est utilisable qu’une fois.</p>
      </section>
      <section style={s.card}>
        {!authenticated ? (
          <form onSubmit={login} style={s.form}>
            <h2 style={s.title}>Connectez-vous pour continuer</h2>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={s.input} /></label>
            <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={s.input} /></label>
            <button className="btn-ink" disabled={busy}><span>{busy ? "Connexion..." : "Se connecter"}</span></button>
            <p style={s.muted}>Utilisez exactement l’adresse email sur laquelle vous avez reçu l’invitation.</p>
          </form>
        ) : accepted ? (
          <div style={s.form}><h2 style={s.title}>Accès activé</h2><p style={s.success}>{message}</p><Link href="/client/daily/organisation" className="btn-ink"><span>Ouvrir mon organisme</span></Link></div>
        ) : (
          <div style={s.form}><h2 style={s.title}>Invitation prête</h2><p>Vous êtes connecté(e) avec <strong>{email}</strong>.</p><button className="btn-ink" onClick={accept} disabled={busy}><span>{busy ? "Activation..." : "Accepter l’invitation"}</span></button></div>
        )}
        {error ? <p style={s.error}>{error}</p> : null}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "2rem 1rem", color: "var(--ink)" },
  hero: { maxWidth: 780, margin: "0 auto 1.5rem", padding: "2rem" },
  card: { maxWidth: 620, margin: "0 auto", padding: "1.5rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)" },
  title: { marginBottom: "1rem", color: "var(--ink)" },
  form: { display: "grid", gap: "1rem" },
  input: { width: "100%", marginTop: ".35rem", padding: ".75rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,.7)" },
  muted: { color: "var(--ink-faint)", fontSize: ".9rem" },
  error: { color: "#9d2f2f", marginTop: "1rem" },
  success: { color: "#2e6d47" },
};
