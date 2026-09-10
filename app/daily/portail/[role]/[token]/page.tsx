import DailyStakeholderWorkspace from "@/components/daily/DailyStakeholderWorkspace";

export default async function DailyPortalPage({ params }: { params: Promise<{ role: string; token: string }> }) {
  const { role, token } = await params;
  const attendanceVisible = ["trainer", "formateur", "learner", "apprenant"].includes(role);
  return <>
    <DailyStakeholderWorkspace role={role} token={token} />
    {attendanceVisible ? <div style={{maxWidth:1100,margin:"-3.5rem auto 4rem",padding:"0 1rem"}}><a href={`/daily/portail/${role}/${token}/presence`} style={{display:"inline-flex",padding:".65rem .85rem",border:"1px solid var(--sepia-mid)",color:"var(--ink)",textDecoration:"none",fontWeight:800}}>Présences & émargement →</a></div> : null}
  </>;
}
