import LateAttendanceForm from "@/components/daily/LateAttendanceForm";

export default async function LateAttendancePage({ params }: { params: Promise<{ role: string; token: string; slotId: string }> }) {
  const { role, token, slotId } = await params;
  return <LateAttendanceForm role={role} token={token} slotId={slotId} />;
}
