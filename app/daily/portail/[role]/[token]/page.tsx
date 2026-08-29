import DailyStakeholderWorkspace from "@/components/daily/DailyStakeholderWorkspace";

export default async function DailyPortalPage({ params }: { params: Promise<{ role: string; token: string }> }) {
  const { role, token } = await params;
  return <DailyStakeholderWorkspace role={role} token={token} />;
}
