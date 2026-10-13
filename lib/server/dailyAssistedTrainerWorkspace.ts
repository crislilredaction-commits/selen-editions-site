import { attendanceParisClock } from "@/lib/server/dailyAttendance";
type Scope = { admin: any; organisationId: string };
const ids = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
const formationTitle = (value: any) => (Array.isArray(value) ? value[0] : value)?.title ?? "Session";

async function assignedSources(scope: Scope) {
  const [trainers, sessions] = await Promise.all([
    scope.admin.from("daily_trainer_profiles").select("id,display_name,professional_email,active,status").eq("organisation_id", scope.organisationId).eq("active", true).neq("status", "archived").order("display_name"),
    scope.admin.from("daily_sessions").select("id,organisation_id,internal_reference,start_date,end_date,status,trainer_ids,daily_formations(title)").eq("organisation_id", scope.organisationId).not("status", "in", "(archived,cancelled)").order("start_date", { ascending: false }),
  ]);
  if (trainers.error || sessions.error) throw new Error(trainers.error?.message ?? sessions.error?.message);
  return { trainers: trainers.data ?? [], sessions: sessions.data ?? [] };
}

export async function listDailyAssistedTrainerSpaces(scope: Scope) {
  const { trainers, sessions } = await assignedSources(scope);
  return trainers.flatMap((trainer: any) => sessions.filter((session: any) => ids(session.trainer_ids).includes(trainer.id)).map((session: any) => ({
    trainerId: trainer.id, trainerName: trainer.display_name || trainer.professional_email || "Formateur",
    trainerEmail: trainer.professional_email, sessionId: session.id,
    sessionLabel: formationTitle(session.daily_formations), startDate: session.start_date, endDate: session.end_date,
  })));
}

export async function readDailyAssistedTrainerSession(scope: Scope, trainerId: string, sessionId: string) {
  const { trainers, sessions } = await assignedSources(scope);
  const trainer = trainers.find((row: any) => row.id === trainerId);
  const session = sessions.find((row: any) => row.id === sessionId && ids(row.trainer_ids).includes(trainerId));
  if (!trainer || !session) return null;
  const [enrolments, slots, records, documents] = await Promise.all([
    scope.admin.from("daily_session_enrolments").select("id,learner_id,status,daily_learners(first_name,last_name,email)").eq("organisation_id", scope.organisationId).eq("session_id", sessionId).not("status", "in", "(declined,cancelled,abandoned)"),
    scope.admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,label,status").eq("organisation_id", scope.organisationId).eq("session_id", sessionId).neq("status", "cancelled").order("slot_date").order("starts_at"),
    scope.admin.from("daily_attendance_records").select("id,slot_id,enrolment_id,status,signed_at").eq("organisation_id", scope.organisationId).eq("session_id", sessionId),
    scope.admin.from("daily_documents").select("id,document_type,logical_name,mime_type,created_at,enrolment_id,status,version").eq("organisation_id", scope.organisationId).eq("session_id", sessionId).eq("is_current", true).neq("status", "archived").in("document_type", ["trainer_resource", "attendance_paper_evidence", "learning_assessment_evidence"]).order("created_at", { ascending: false }),
  ]);
  const error = enrolments.error ?? slots.error ?? records.error ?? documents.error;
  if (error) throw new Error(error.message);
  const enrolmentIds = new Set((enrolments.data ?? []).map((row: any) => row.id));
  const slotIds = new Set((slots.data ?? []).map((row: any) => row.id));
  const clock = attendanceParisClock();
  const visibleSlots = (slots.data ?? []).map((slot: any) => {
    const [hours, minutes] = String(slot.ends_at).slice(0,5).split(":").map(Number);
    const phase = slot.slot_date < clock.date || (slot.slot_date === clock.date && clock.minutes >= hours * 60 + minutes) ? "closed" : slot.slot_date > clock.date ? "upcoming" : "open";
    return { ...slot, phase };
  });
  return { trainer, session, enrolments: enrolments.data ?? [], slots: visibleSlots,
    records: (records.data ?? []).filter((row: any) => enrolmentIds.has(row.enrolment_id) && slotIds.has(row.slot_id)), documents: (documents.data ?? []).filter((row: any) => !row.enrolment_id || enrolmentIds.has(row.enrolment_id)), readOnly: true as const };
}
