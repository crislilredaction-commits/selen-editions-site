"use client";

import { useState } from "react";
import {
  PREREQUISITE_EVIDENCE_ACCEPT,
  PREREQUISITE_EVIDENCE_MAX_FILE_BYTES,
  type PrerequisiteRequirement,
  type PrerequisiteSubject,
} from "@/lib/daily/prerequisiteEvidence";

export default function PrerequisiteEvidenceFiles({ rows, onChange }: {
  rows: Array<{
    key: string;
    participantIndex: number;
    requirementIndex: number;
    subject: PrerequisiteSubject;
    requirement: PrerequisiteRequirement;
    file?: File;
  }>;
  onChange: (key: string, file: File | null) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!rows.length) return null;
  return <section style={{ display: "grid", gap: 12, margin: "18px 0", padding: 18, border: "1px solid var(--sepia-mid)" }}>
    <h2 style={{ margin: 0 }}>Justificatifs de prérequis</h2>
    <p style={{ margin: 0 }}>Joignez une preuve pour chaque prérequis et pour chaque apprenant. Les pièces obligatoires doivent être jointes ; les autres sont facultatives. Leur validation reste effectuée humainement par Selen.</p>
    {rows.map((row) => {
      const subjectName = [row.subject.first_name, row.subject.last_name].filter(Boolean).join(" ") || `Apprenant ${row.participantIndex + 1}`;
      return <label key={row.key} style={{ display: "grid", gap: 7 }}>
        <strong>{row.requirement.label} · {subjectName}{row.requirement.required === false ? " (facultatif)" : " *"}</strong>
        {row.requirement.description ? <span>{row.requirement.description}</span> : null}
        <input
          type="file"
          accept={PREREQUISITE_EVIDENCE_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file && (file.size === 0 || file.size > PREREQUISITE_EVIDENCE_MAX_FILE_BYTES)) {
              setErrors((current) => ({ ...current, [row.key]: file.size === 0 ? "Ce fichier est vide." : "Ce fichier dépasse 2 Mo. Réduisez sa taille avant de le joindre." }));
              event.target.value = "";
              onChange(row.key, null);
              return;
            }
            setErrors((current) => ({ ...current, [row.key]: "" }));
            onChange(row.key, file);
          }}
        />
        {errors[row.key] ? <small role="alert">{errors[row.key]}</small> : null}
        <small>{row.file ? `Joint : ${row.file.name}` : row.requirement.required === false ? "Justificatif facultatif." : "Justificatif à joindre obligatoirement."}</small>
      </label>;
    })}
    <small>PDF, JPG ou PNG, 2 Mo maximum par fichier. L’ensemble des documents privés du dossier doit rester inférieur à 4 Mo.</small>
  </section>;
}

