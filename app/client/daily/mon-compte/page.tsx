import Link from "next/link";
import DailyAccountPanel from "@/components/daily/DailyAccountPanel";
import DailyReminderPreferences from "@/components/daily/DailyReminderPreferences";

export default function DailyAccountPage() {
  return <><DailyAccountPanel/><DailyReminderPreferences/><section style={{maxWidth:1050,margin:"1rem auto",background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.4rem 1.5rem",color:"#392a19"}}><p style={{textTransform:"uppercase",letterSpacing:".14em",fontSize:11,fontWeight:800,color:"#9b682d"}}>Documents à destination des apprenants</p><h2 style={{fontFamily:"Georgia,serif"}}>Bibliothèque de l'organisme</h2><p style={{color:"#725e46",lineHeight:1.55}}>Publiez vos propres documents dans tous les espaces apprenants, pour une session ou seulement pour certains apprenants.</p><Link href="/client/daily/documents-apprenants" style={{display:"inline-block",border:"1px solid #7a2e22",background:"#7a2e22",color:"#fff8e8",padding:".75rem 1rem",fontWeight:800,textDecoration:"none"}}>Gérer les documents diffusés aux apprenants →</Link></section></>;
}
