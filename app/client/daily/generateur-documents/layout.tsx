import Link from "next/link";

export default function DailyDocumentGeneratorLayout({children}:{children:React.ReactNode}){
  return <>
    <div style={{maxWidth:900,margin:"1rem auto 0",padding:"0 1rem",display:"grid",gap:10}}>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <Link href="/client/daily/generateur-documents" style={link}>Générer un dossier apprenant</Link>
        <Link href="/client/daily/generateur-documents/versions" style={link}>Importer / remplacer un PDF</Link>
      </div>
      <div style={info}>
        <strong>À quoi sert la génération de dossier ?</strong>
        <p style={{margin:".35rem 0 0"}}>Elle permet surtout de constituer un dossier papier lorsque les conditions ne permettent pas d’utiliser correctement les espaces numériques Daily, par exemple en cas de contrainte technique, d’accès limité ou lorsqu’un support papier est nécessaire.</p>
      </div>
    </div>
    {children}
  </>;
}
const link:React.CSSProperties={display:"inline-block",padding:".65rem .85rem",border:"1px solid var(--sepia-mid)",background:"var(--paper)",color:"var(--rust)",fontWeight:800,textDecoration:"none"};
const info:React.CSSProperties={border:"1px solid var(--sepia-mid)",background:"var(--paper)",padding:"1rem 1.1rem",color:"var(--ink-soft)",lineHeight:1.55};
