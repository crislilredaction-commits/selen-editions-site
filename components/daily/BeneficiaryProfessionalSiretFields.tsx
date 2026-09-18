"use client";

import { normalizeBeneficiarySiret } from "@/lib/dailyBeneficiarySiret";

type Props = {
  value?: string;
  onChange: (value: string) => void;
};

export default function BeneficiaryProfessionalSiretFields({ value = "", onChange }: Props) {
  const normalized = normalizeBeneficiarySiret(value);
  const invalid = normalized.length > 0 && normalized.length !== 14;

  return (
    <div style={{ display: "grid", gap: ".45rem" }}>
      <p style={{ margin: 0, lineHeight: 1.55 }}>
        Vous suivez vous-même la formation ? Choisissez bien <strong>« Je suis apprenant »</strong>, même si vous avez un SIRET. Le choix « Je représente une entreprise » est réservé à la personne qui inscrit ou représente un autre bénéficiaire.
      </p>
      <label style={{ display: "grid", gap: ".35rem", fontWeight: 700 }}>
        <span>Votre SIRET professionnel, si vous en avez un</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={invalid}
          aria-describedby="beneficiary-siret-help"
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(normalized)}
          placeholder="14 chiffres"
          style={{ width: "100%", border: "1px solid rgba(178,138,98,0.55)", background: "rgba(255,250,239,0.82)", padding: ".7rem", boxSizing: "border-box" }}
        />
      </label>
      <small id="beneficiary-siret-help" style={{ lineHeight: 1.45 }}>
        Facultatif. Il sert à préparer votre convention lorsque vous contractez pour votre propre activité ; il ne crée pas d’entreprise commanditaire ni d’espace entreprise.
      </small>
      {invalid ? <p role="alert" style={{ margin: 0, color: "var(--rust)" }}>Le SIRET doit contenir exactement 14 chiffres.</p> : null}
    </div>
  );
}
