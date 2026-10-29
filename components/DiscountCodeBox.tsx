"use client";

import { FormEvent, useState } from "react";

export type AppliedDiscount = {
  code: string;
  discountCodeId: string;
  discountAmountCents: number;
  finalAmountCents: number;
  label: string;
};

type DiscountCodeBoxProps = {
  amountCents: number;
  clientEmail: string;
  onClientEmailChange: (value: string) => void;
  discount: AppliedDiscount | null;
  onDiscountChange: (discount: AppliedDiscount | null) => void;
};

function formatAmount(amountCents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amountCents / 100);
}

export default function DiscountCodeBox({
  amountCents,
  clientEmail,
  onClientEmailChange,
  discount,
  onDiscountChange,
}: DiscountCodeBoxProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const finalAmountCents = discount?.finalAmountCents ?? amountCents;

  async function applyDiscount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          clientEmail,
          amountCents,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        throw new Error(data.reason || data.error || "Code refusé.");
      }

      onDiscountChange({
        code: data.code || code,
        discountCodeId: data.discountCodeId,
        discountAmountCents: data.discountAmountCents,
        finalAmountCents: data.finalAmountCents,
        label: data.label || code,
      });
      setMessage("Code appliqué.");
    } catch (applyError) {
      onDiscountChange(null);
      setError(
        applyError instanceof Error ? applyError.message : "Code refusé.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px solid rgba(178,138,98,0.35)",
        borderBottom: "1px solid rgba(178,138,98,0.35)",
        padding: "1rem 0",
        display: "grid",
        gap: "0.75rem",
      }}
    >
      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span className="gazette-label">Email client</span>
        <input
          type="email"
          value={clientEmail}
          onChange={(event) => {
            onClientEmailChange(event.target.value);
            onDiscountChange(null);
          }}
          placeholder="vous@email.fr"
          style={{
            padding: "0.65rem",
            border: "1px solid var(--sepia-mid)",
            background: "rgba(255,255,255,0.55)",
          }}
        />
      </label>

      <form onSubmit={applyDiscount} style={{ display: "grid", gap: "0.5rem" }}>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span className="gazette-label">Code de réduction</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code Selen"
            style={{
              padding: "0.65rem",
              border: "1px solid var(--sepia-mid)",
              background: "rgba(255,255,255,0.55)",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="submit"
            className="btn-ink"
            disabled={loading}
            style={{ flex: "1 1 140px" }}
          >
            <span>{loading ? "Vérification..." : "Appliquer"}</span>
          </button>

          {discount ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onDiscountChange(null);
                setMessage("");
                setError("");
                setCode("");
              }}
              style={{ flex: "1 1 120px" }}
            >
              <span>Retirer le code</span>
            </button>
          ) : null}
        </div>
      </form>

      {message ? <p style={{ color: "#4f6f36" }}>{message}</p> : null}
      {error ? <p style={{ color: "var(--rust)" }}>{error}</p> : null}

      <div style={{ display: "grid", gap: "0.4rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Total initial</span>
          <strong>{formatAmount(amountCents)}</strong>
        </div>

        {discount ? (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Réduction</span>
            <strong>-{formatAmount(discount.discountAmountCents)}</strong>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Total à payer</span>
          <strong>{formatAmount(finalAmountCents)}</strong>
        </div>
      </div>
    </div>
  );
}
