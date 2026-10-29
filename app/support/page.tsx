"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const categories = [
  { value: "question", label: "Question" },
  { value: "reclamation", label: "Réclamation" },
  { value: "paiement", label: "Problème de paiement" },
  { value: "acces", label: "Problème d’accès" },
  { value: "bug", label: "Bug / problème technique" },
  { value: "audit", label: "Audit blanc / Review" },
  { value: "nda", label: "Dossier NDA" },
  { value: "autre", label: "Autre" },
];

export default function SupportPage() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("question");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccess("");
    setError("");

    const response = await fetch("/api/support/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        clientEmail,
        subject,
        category,
        message,
        pageUrl:
          typeof window !== "undefined" ? window.location.href : "/support",
        metadata: {
          source: "vitrine_support_form",
        },
      }),
    });

    const result = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(result.error ?? "Impossible d’envoyer votre demande.");
      return;
    }

    setSuccess(
      "Votre demande a bien été transmise à Selen. Nous reviendrons vers vous rapidement.",
    );
    setSubject("");
    setMessage("");
  }

  return (
    <main className="min-h-screen bg-[#f4ead8] px-6 py-12 text-[#3b281b]">
      <section className="mx-auto max-w-3xl rounded-3xl border border-[#d1aa6b] bg-[#fff8ea] p-8 shadow-lg">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#b9823f]">
          Support Selen
        </p>

        <h1 className="mb-4 font-serif text-4xl">Prévenir Selen</h1>

        <p className="mb-8 leading-7 text-[#6d5947]">
          Une question, un souci d’accès, un problème de paiement ou une
          réclamation ? Envoyez-nous votre message ici. Une fiche support sera
          créée afin de suivre votre demande proprement.
        </p>

        {success ? (
          <div className="mb-6 rounded-2xl border border-green-700 bg-green-50 p-4 text-green-800">
            {success}
          </div>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-700 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="grid gap-5">
          <label className="grid gap-2">
            <span>Nom / organisme</span>
            <input
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              className="rounded-xl border border-[#d1aa6b] bg-white px-4 py-3 text-[#3b281b]"
              placeholder="Ex : Dupont Jean"
            />
          </label>

          <label className="grid gap-2">
            <span>Email</span>
            <input
              required
              type="email"
              value={clientEmail}
              onChange={(event) => setClientEmail(event.target.value)}
              className="rounded-xl border border-[#d1aa6b] bg-white px-4 py-3 text-[#3b281b]"
              placeholder="vous@email.fr"
            />
          </label>

          <label className="grid gap-2">
            <span>Type de demande</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-xl border border-[#d1aa6b] bg-white px-4 py-3 text-[#3b281b]"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span>Sujet</span>
            <input
              required
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="rounded-xl border border-[#d1aa6b] bg-white px-4 py-3 text-[#3b281b]"
              placeholder="Ex : Je n’arrive pas à accéder à mon préaudit"
            />
          </label>

          <label className="grid gap-2">
            <span>Message</span>
            <textarea
              required
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-40 rounded-xl border border-[#d1aa6b] bg-white px-4 py-3 text-[#3b281b]"
              placeholder="Expliquez-nous votre demande..."
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-[#3b281b] px-5 py-3 font-semibold text-[#fff8ea] disabled:opacity-60"
          >
            {loading ? "Envoi en cours..." : "Envoyer ma demande"}
          </button>
        </form>

        <div className="mt-8 text-sm text-[#6d5947]">
          Besoin d’un échange direct ?{" "}
          <Link href="/prendre-rendez-vous" className="underline">
            Prendre un rendez-vous téléphonique
          </Link>
        </div>
      </section>
    </main>
  );
}
