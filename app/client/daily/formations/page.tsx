import DailyFormationsManager from "@/components/daily/DailyFormationsManager";
import "./formations.css";

type CreationMode = "program_import" | "selen_form" | null;
type FormationSearchParams = Record<string, string | string[] | undefined>;

function resolveCreationMode(value: string | string[] | undefined): CreationMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "programme" || raw === "program_import") return "program_import";
  if (raw === "formulaire" || raw === "selen_form") return "selen_form";
  return null;
}

export default async function DailyFormationsPage({
  searchParams,
}: {
  searchParams?: Promise<FormationSearchParams>;
}) {
  const params: FormationSearchParams = searchParams ? await searchParams : {};
  const creationMode = resolveCreationMode(params.creation);

  return (
    <div className="daily-formations-compact">
      {creationMode ? (
        <div
          role="status"
          style={{
            maxWidth: 1180,
            margin: "0 auto 14px",
            padding: "12px 16px",
            borderRadius: 14,
            background: "#f7f0e5",
            color: "#5f4638",
            lineHeight: 1.5,
          }}
        >
          <strong>
            {creationMode === "program_import" ? "Création depuis votre programme" : "Création avec le formulaire Selen"}
          </strong>
          <div>
            {creationMode === "program_import"
              ? "Importez votre programme original. Selen conserve ce document et ne doit vous demander ensuite que les compléments nécessaires."
              : "Renseignez les données structurées de la formation directement dans Selen."}
          </div>
        </div>
      ) : null}
      <DailyFormationsManager creationMode={creationMode ?? undefined} />
    </div>
  );
}
