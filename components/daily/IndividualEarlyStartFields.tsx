import {
  formatIndividualEarlyStartDate,
  individualEarlyStartRequestText,
  INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT,
} from "@/lib/dailyIndividualEarlyStart";

type Props = {
  sessionStartDate: string;
  distanceWithdrawalDeadline: string;
  requested: boolean;
  fullPerformanceWithdrawalLossAcknowledged: boolean;
  onRequestedChange: (checked: boolean) => void;
  onFullPerformanceWithdrawalLossAcknowledgedChange: (checked: boolean) => void;
};

export default function IndividualEarlyStartFields({
  sessionStartDate,
  distanceWithdrawalDeadline,
  requested,
  fullPerformanceWithdrawalLossAcknowledged,
  onRequestedChange,
  onFullPerformanceWithdrawalLossAcknowledgedChange,
}: Props) {
  return (
    <section style={s.section} aria-labelledby="individual-early-start-title">
      <div style={s.stack}>
        <p style={s.label}>Date de formation proche</p>
        <h2 id="individual-early-start-title" style={s.title}>Votre demande de démarrage anticipé</h2>
        <p style={s.text}>
          La session débute le <strong>{formatIndividualEarlyStartDate(sessionStartDate)}</strong>. Si votre contrat est conclu aujourd&apos;hui, cette date tombe avant la fin du délai de rétractation à distance, calculé ici jusqu&apos;au <strong>{formatIndividualEarlyStartDate(distanceWithdrawalDeadline)}</strong> inclus.
        </p>
        <p style={s.notice}>
          Cette demande ne supprime pas votre droit de rétractation et ne constitue pas une renonciation générale. Le contrat individuel de formation conserve aussi son délai propre de dix jours, pendant lequel aucune somme ne peut être exigée.
        </p>
      </div>

      <label style={s.choice}>
        <input
          type="checkbox"
          checked={requested}
          onChange={(event) => onRequestedChange(event.target.checked)}
        />
        <span>
          {individualEarlyStartRequestText(sessionStartDate)}
        </span>
      </label>

      <label style={s.choice}>
        <input
          type="checkbox"
          checked={fullPerformanceWithdrawalLossAcknowledged}
          onChange={(event) => onFullPerformanceWithdrawalLossAcknowledgedChange(event.target.checked)}
        />
        <span>
          {INDIVIDUAL_FULL_PERFORMANCE_ACKNOWLEDGEMENT_TEXT}
        </span>
      </label>

      <small style={s.help}>
        Ces confirmations sont distinctes : la première demande un commencement anticipé ; la seconde atteste uniquement que vous avez compris la conséquence légale d&apos;une exécution complète.
      </small>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  section: {
    display: "grid",
    gap: ".85rem",
    border: "1px solid rgba(138,75,36,.4)",
    borderLeft: "4px solid var(--rust)",
    background: "rgba(138,75,36,.06)",
    padding: "1rem",
  },
  stack: { display: "grid", gap: ".5rem" },
  label: { margin: 0, color: "var(--rust)", fontSize: ".8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em" },
  title: { margin: 0, color: "var(--ink)" },
  text: { margin: 0, color: "var(--ink)", lineHeight: 1.55 },
  notice: { margin: 0, color: "var(--ink-soft)", lineHeight: 1.55 },
  choice: { display: "flex", alignItems: "flex-start", gap: ".65rem", color: "var(--ink)", lineHeight: 1.55, fontWeight: 700 },
  help: { color: "var(--ink-soft)", lineHeight: 1.45 },
};
