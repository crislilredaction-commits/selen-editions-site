import type { getAdminSupabase } from "@/lib/server/clientNdaAccess";

export async function refreshDailyAttendanceChecklist(
  admin: ReturnType<typeof getAdminSupabase>,
  organisationId: string,
  sessionId: string,
) {
  const { data: slots, error: slotsError } = await admin
    .from("daily_attendance_slots")
    .select("id,status")
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .neq("status", "cancelled");
  if (slotsError) throw new Error(slotsError.message);

  const slotIds = (slots ?? []).map((slot) => slot.id);
  let records: Array<{ status: string }> = [];
  if (slotIds.length > 0) {
    const { data, error } = await admin
      .from("daily_attendance_records")
      .select("status")
      .eq("organisation_id", organisationId)
      .eq("session_id", sessionId)
      .in("slot_id", slotIds);
    if (error) throw new Error(error.message);
    records = data ?? [];
  }

  const nextStatus = slotIds.length === 0
    ? "not_applicable"
    : records.length > 0 && records.every((record) => record.status !== "pending") && (slots ?? []).every((slot) => slot.status === "closed")
      ? "to_review"
      : "in_progress";

  const { error: checklistError } = await admin
    .from("daily_session_checklist_items")
    .update({ status: nextStatus })
    .eq("organisation_id", organisationId)
    .eq("session_id", sessionId)
    .eq("item_key", "attendance_followup")
    .in("status", ["todo", "in_progress", "to_review"]);
  if (checklistError) throw new Error(checklistError.message);
}
