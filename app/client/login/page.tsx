"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ClientLoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    router.push("/client");
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#1a1410] text-[#f0e8d8] px-4">
      <section className="w-full max-w-md rounded-2xl bg-[#241a14] border border-[#c9943a]/30 p-6 shadow-xl">
        <h1 className="text-2xl font-bold mb-2 text-center">
          Espace client Selen
        </h1>

        <p className="text-sm text-center mb-6 opacity-80">
          Connectez-vous pour accéder à vos outils.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-lg bg-[#1a1410] border border-[#3a2a20] px-3 py-2 outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Mot de passe"
            className="w-full rounded-lg bg-[#1a1410] border border-[#3a2a20] px-3 py-2 outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#c9943a] text-black font-semibold px-4 py-2 disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {message && (
          <p className="mt-4 text-sm text-center text-[#c9943a]">{message}</p>
        )}
      </section>
    </main>
  );
}
