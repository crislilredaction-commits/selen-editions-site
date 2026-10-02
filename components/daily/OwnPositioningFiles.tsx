"use client";
import { useState } from "react";
import { OWN_POSITIONING_ACCEPT, OWN_POSITIONING_MAX_BYTES, type PositioningSubject } from "@/lib/daily/ownPositioning";

export default function OwnPositioningFiles({ downloadUrl, name, rows, onChange }: {
  downloadUrl: string; name: string;
  rows: Array<{ key: string; subject: PositioningSubject; file?: File }>;
  onChange: (key: string, file: File | null) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return <section style={{ display: "grid", gap: 12, margin: "18px 0", padding: 18, border: "1px solid var(--sepia-mid)" }}>
    <h2 style={{ margin: 0 }}>Votre document de positionnement</h2>
    <p style={{ margin: 0 }}>Téléchargez le questionnaire de votre organisme, remplissez-le hors Selen, puis joignez le document rempli pour chaque apprenant avant d’envoyer le dossier.</p>
    <a href={downloadUrl} download rel="noreferrer">Télécharger {name}</a>
    {rows.map((row, index) => <label key={row.key} style={{ display: "grid", gap: 7 }}>
      <strong>{rows.length > 1 ? `${index + 1}. ` : ""}{[row.subject.first_name, row.subject.last_name].filter(Boolean).join(" ") || "Document rempli"}{row.subject.email ? ` · ${row.subject.email}` : ""} *</strong>
      <input type="file" accept={OWN_POSITIONING_ACCEPT} onChange={event => {
        const file = event.target.files?.[0] ?? null;
        if (file && (file.size === 0 || file.size > OWN_POSITIONING_MAX_BYTES)) {
          setErrors(current => ({ ...current, [row.key]: file.size === 0 ? "Ce fichier est vide." : "Ce fichier dépasse 3 Mo. Réduisez sa taille avant de le joindre." }));
          event.target.value = ""; onChange(row.key, null); return;
        }
        setErrors(current => ({ ...current, [row.key]: "" }));
        onChange(row.key, file);
      }} />
      {errors[row.key] ? <small role="alert">{errors[row.key]}</small> : null}
      <small>{row.file ? `Joint : ${row.file.name}` : "Document rempli à joindre obligatoirement."}</small>
    </label>)}
    <small>PDF ou Word. Les documents joints doivent peser au total moins de 3 Mo. Leur dépôt ne vaut pas validation par l’organisme.</small>
  </section>;
}
