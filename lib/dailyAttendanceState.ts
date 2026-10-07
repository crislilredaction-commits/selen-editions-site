export type DailyAttendanceStatus = "pending" | "present" | "absent" | "excused";

export function dailyAttendanceLabel(status?: string | null, phase?: string | null) {
  if (status === "present") return "Signé";
  if (status === "excused") return "Absence justifiée";
  if (status === "absent") return "Absent";
  return phase === "closed" ? "En attente de régularisation" : "En attente";
}

export function dailyAttendanceSummary(statuses: Array<string | null | undefined>) {
  if (statuses.length === 0 || statuses.every((status) => !status || status === "pending")) return "En attente";
  if (statuses.every((status) => status === "present")) return "Signé";
  if (statuses.every((status) => status === "absent" || status === "excused")) return "Absent";
  return "Partiel";
}
