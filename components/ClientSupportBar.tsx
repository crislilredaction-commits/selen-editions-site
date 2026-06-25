"use client";

import Link from "next/link";

type ClientSupportBarProps = {
  email?: string | null;
  context?: string;
};

export default function ClientSupportBar({
  email,
  context = "auto-audit Qualiopi",
}: ClientSupportBarProps) {
  function openSupportEmail() {
    const pageUrl =
      typeof window !== "undefined" ? window.location.href : "Page inconnue";

    const subject = `Bug ou difficulté sur ${context}`;

    const body = [
      "Bonjour,",
      "",
      `Je rencontre une difficulté pendant l’utilisation de ${context}.`,
      "",
      `Page concernée : ${pageUrl}`,
      `Email du compte : ${email || "Non renseigné"}`,
      "",
      "Description du problème :",
      "",
      "",
      "Ce que j’essayais de faire :",
      "",
      "",
      "Merci.",
    ].join("\n");

    window.location.href = `mailto:hello@selen-editions.fr?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(178,138,98,0.35)",
        background: "rgba(248,239,223,0.82)",
        padding: "0.75rem 1rem",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <p
          style={{
            color: "var(--ink-soft)",
            fontSize: "0.88rem",
            lineHeight: 1.4,
          }}
        >
          Un bug, une difficulté ou une question pendant l’utilisation ?
        </p>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link
            href="/prendre-rendez-vous?source=client_space"
            className="btn-ink"
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: "0.82rem",
              textDecoration: "none",
            }}
          >
            <span>Réserver un appel</span>
          </Link>

          <button
            type="button"
            onClick={openSupportEmail}
            className="btn-ink"
            style={{
              padding: "0.45rem 0.8rem",
              fontSize: "0.82rem",
            }}
          >
            <span>Prévenir Selen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
