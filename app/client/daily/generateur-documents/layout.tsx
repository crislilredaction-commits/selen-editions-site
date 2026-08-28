import Link from "next/link";

export default function DailyDocumentGeneratorLayout({children}:{children:React.ReactNode}){
  return <>
    <div style={{maxWidth:900,margin:"1rem auto 0",padding:"0 1rem",display:"flex",gap:10,flexWrap:"wrap"}}>
      <Link href="/client/daily/generateur-documents" style={link}>Générer un dossier apprenant</Link>
      <Link href="/client/daily/generateur-documents/versions" style={link}>Importer / remplacer un PDF</Link>
    </div>
    {children}
  </>;
}
const link:React.CSSProperties={display:"inline-block",padding:".65rem .85rem",border:"1px solid var(--sepia-mid)",background:"var(--paper)",color:"var(--rust)",fontWeight:800,textDecoration:"none"};
