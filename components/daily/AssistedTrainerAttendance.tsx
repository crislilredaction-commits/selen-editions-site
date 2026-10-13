import { dailyAttendanceLabel } from "@/lib/dailyAttendanceState";
type Learner = { first_name?: string; last_name?: string; email?: string };
type Enrolment = { id: string; daily_learners: Learner | Learner[] | null };
type Slot = { id: string; slot_date: string; starts_at: string; ends_at: string; label?: string | null; phase?: string };
export type AssistedTrainerAttendanceData = {
  trainer: { display_name?: string; professional_email?: string };
  session: { internal_reference?: string; daily_formations?: {title?: string} | {title?: string}[] };
  enrolments: Enrolment[]; slots: Slot[];
  records: { slot_id: string; enrolment_id: string; status: string; signed_at?: string | null }[];
  documents?: { id: string; logical_name?: string | null; document_type: string }[];
  entries?: { id: string; enrolment_id?: string | null; entry_type: string; level: string; occurred_at: string; summary: string; description?: string | null; action_taken?: string | null; status: string; author_name?: string | null }[];
  readOnly: true;
};
export default function AssistedTrainerAttendance({ data }: { data: AssistedTrainerAttendanceData }) {
  const formation = Array.isArray(data.session.daily_formations) ? data.session.daily_formations[0] : data.session.daily_formations;
  return <section className="gazette-card grid gap-5 p-6">
    <h1 className="text-3xl font-bold">{data.trainer.display_name || data.trainer.professional_email || "Formateur"} · {formation?.title || data.session.internal_reference || "Session"}</h1>
    <p>Consultation en délégation · lecture seule. Les signatures sont réalisées par chaque titulaire depuis son propre accès.</p>
    <h2 className="text-xl font-bold">Présences par créneau</h2>
    {data.slots.length === 0 ? <p>Aucun créneau d’émargement n’est encore préparé.</p> : data.slots.map(slot => <section key={slot.id}>
      <h3 className="font-bold">{slot.slot_date} · {slot.starts_at.slice(0,5)} à {slot.ends_at.slice(0,5)}{slot.label ? ` · ${slot.label}` : ""}</h3>
      {data.enrolments.length === 0 ? <p>Aucune inscription active pour cette session.</p> : <div className="overflow-x-auto"><table aria-label={`Présences du ${slot.slot_date}`} className="mt-3 w-full text-left"><thead><tr><th scope="col">Apprenant</th><th scope="col">Présence</th><th scope="col">Signature</th></tr></thead><tbody>{data.enrolments.map(enrolment => {
        const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
        const record = data.records.find(row => row.slot_id === slot.id && row.enrolment_id === enrolment.id);
        return <tr key={enrolment.id}><th scope="row">{[learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"}</th><td>{dailyAttendanceLabel(record?.status, slot.phase)}</td><td>{record?.signed_at ? new Intl.DateTimeFormat("fr-FR", {dateStyle:"short",timeStyle:"short",timeZone:"Europe/Paris"}).format(new Date(record.signed_at)) : "Non signée"}</td></tr>;
      })}</tbody></table></div>}
    </section>)}
    <h2 className="text-xl font-bold">Suivi pédagogique et événements</h2>
    {!data.entries?.length ? <p>Aucune note ni événement de suivi enregistré pour cette session.</p> : <div className="grid gap-3">{data.entries.map(entry => <article key={entry.id} className="border border-[#b28a62]/35 p-4"><div className="flex flex-wrap items-center gap-2"><strong>{entry.summary}</strong><span className="text-sm">{entry.entry_type} · {entry.status}</span></div><p className="text-sm">{new Date(entry.occurred_at).toLocaleDateString("fr-FR")}{entry.author_name ? ` · ${entry.author_name}` : ""}</p>{entry.description ? <p className="mt-2 whitespace-pre-wrap">{entry.description}</p> : null}{entry.action_taken ? <p className="mt-2 whitespace-pre-wrap">Action : {entry.action_taken}</p> : null}</article>)}</div>}
  </section>;
}
