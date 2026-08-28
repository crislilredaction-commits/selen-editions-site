import Link from "next/link";
import type { ReactNode } from "react";
export default function QualityLayout({children}:{children:ReactNode}){return <><nav style={{maxWidth:1080,margin:"1rem auto 0",padding:"0 1rem",display:"flex",gap:8,flexWrap:"wrap"}}><Link href="/client/daily/qualite/pilotage" style={link}>Pilotage qualité</Link><Link href="/client/daily/qualite" style={link}>Mes veilles</Link></nav>{children}</>}
const link={display:"inline-block",border:"1px solid #b98b52",background:"#fff8e8",color:"#7a2e22",padding:".6rem .8rem",fontWeight:800,textDecoration:"none",fontSize:13};
