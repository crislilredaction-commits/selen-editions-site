"use client";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export default function ClientLoginPage() {
  const supabase = createSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");
    setIsSuccess(false);

    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo:
          typeof window !== "undefined"
            ? `${window.location.origin}/client`
            : undefined,
      },
    });

    if (error) {
      setMessage(error.message);
      setIsSuccess(false);
      setLoading(false);
      return;
    }

    setMessage(
      "Un lien de connexion vient de vous être envoyé. Pensez à vérifier vos courriers indésirables si vous ne le voyez pas arriver.",
    );
    setIsSuccess(true);
    setLoading(false);
  };

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="mx-auto flex min-h-[75vh] max-w-6xl items-center justify-center px-4 py-12 md:px-6">
        <div className="w-full max-w-xl">
          <div className="gazette-card p-6 md:p-10">
            <div className="gazette-band" />

            <div className="pt-4 text-center">
              <p className="gazette-label">Espace client</p>

              <h1 className="mt-4 font-['Playfair_Display'] text-3xl md:text-5xl font-bold text-[#3e2a1f]">
                Connexion Selen
              </h1>

              <p className="mx-auto mt-4 max-w-md leading-7 text-[#5a4031]">
                Entrez votre adresse email. Nous vous enverrons un lien sécurisé
                pour accéder à votre espace client, sans mot de passe à retenir.
              </p>
            </div>

            <form onSubmit={handleMagicLinkLogin} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block font-['Cinzel'] text-[0.62rem] uppercase tracking-[0.22em] text-[#8a6243]"
                >
                  Adresse email
                </label>

                <input
                  id="email"
                  type="email"
                  placeholder="votre@email.fr"
                  className="w-full border border-[#b28a62]/40 bg-white/50 px-4 py-3 text-[#3e2a1f] outline-none transition focus:border-[#8a4b24]"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-ink w-full text-center"
                style={{
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                <span>
                  {loading
                    ? "Envoi du lien…"
                    : "Recevoir mon lien de connexion"}
                </span>
              </button>
            </form>

            {message && (
              <div
                className="mt-5 border p-4 text-sm leading-6"
                style={{
                  borderColor: isSuccess ? "#6a8a4a" : "var(--rust)",
                  background: isSuccess
                    ? "rgba(106,138,74,0.08)"
                    : "rgba(138,75,36,0.06)",
                  color: isSuccess ? "#4f6f36" : "var(--rust)",
                }}
              >
                {message}
              </div>
            )}

            <div className="mt-6 border-t border-[#b28a62]/30 pt-5">
              <p className="text-sm leading-6 text-[#6e4a32]">
                Vous venez d’acheter l’auto-audit ? Utilisez la même adresse
                email que celle indiquée lors du paiement Stripe.
              </p>

              <p className="mt-3 text-sm leading-6 text-[#6e4a32]">
                Si l’email n’arrive pas dans les prochaines minutes, vérifiez
                vos spams ou courriers indésirables.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/client" className="btn-ink text-center">
                <span>Retour espace client</span>
              </Link>

              <Link href="/nos-prestations" className="btn-ink text-center">
                <span>Retour aux prestations</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
