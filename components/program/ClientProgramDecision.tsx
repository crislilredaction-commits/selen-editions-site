"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import SelenTextarea from "@/components/ui/SelenTextarea";

const MAX_PROGRAM_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_PROGRAM_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

type Props = {
  dossierId: string;
  programVersionId: string;
};

export default function ClientProgramDecision({
  dossierId,
  programVersionId,
}: Props) {
  const router = useRouter();

  const [decisionLoading, setDecisionLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(nextFile: File | null) {
    setError(null);

    if (!nextFile) {
      setFile(null);
      return;
    }

    const extension = nextFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_PROGRAM_EXTENSIONS.has(extension)) {
      setFile(null);
      setError("Format non autorisé. Utilisez un fichier PDF, DOC ou DOCX.");
      return;
    }

    if (nextFile.size > MAX_PROGRAM_UPLOAD_BYTES) {
      setFile(null);
      setError("Le fichier est trop volumineux. La taille maximale est de 10 Mo.");
      return;
    }

    setFile(nextFile);
  }

  async function handleDecision(decision: "validated" | "refused") {
    try {
      setError(null);

      if (decision === "refused") {
        if (!comment.trim()) {
          setError("Merci d’indiquer un commentaire.");
          return;
        }

        if (!file) {
          setError("Merci d’ajouter votre version modifiée.");
          return;
        }
      }

      setDecisionLoading(true);

      const formData = new FormData();
      formData.append("dossierId", dossierId);
      formData.append("programVersionId", programVersionId);
      formData.append("decision", decision);
      formData.append("comment", comment);

      if (file) {
        formData.append("file", file);
      }

      const res = await fetch("/api/client/program/decision", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error ?? "Impossible d’enregistrer la décision.");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setDecisionLoading(false);
    }
  }

  return (
    <SelenCard>
      <SelenCardTitle>Décision sur le programme</SelenCardTitle>

      <p
        style={{
          fontSize: 13,
          color: "var(--selen-text2)",
          marginBottom: 16,
        }}
      >
        Vous pouvez valider cette proposition ou proposer des modifications.
      </p>

      {error && (
        <div
          style={{
            background: "rgba(185,78,72,0.08)",
            border: "1px solid rgba(185,78,72,0.25)",
            padding: 10,
            borderRadius: 8,
            fontSize: 12,
            color: "var(--selen-danger)",
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      <SelenTextarea
        placeholder="Commentaire (obligatoire si refus)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      <div style={{ marginTop: 10 }}>
        <input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            color: "var(--selen-text2)",
          }}
        >
          PDF, DOC ou DOCX · 10 Mo maximum
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 18,
          flexWrap: "wrap",
        }}
      >
        <SelenButton
          variant="primary"
          disabled={decisionLoading}
          onClick={() => handleDecision("validated")}
        >
          ✅ Je valide le programme
        </SelenButton>

        <SelenButton
          variant="ghost"
          disabled={decisionLoading}
          onClick={() => handleDecision("refused")}
        >
          ✏️ Je refuse et propose une modification
        </SelenButton>
      </div>
    </SelenCard>
  );
}
