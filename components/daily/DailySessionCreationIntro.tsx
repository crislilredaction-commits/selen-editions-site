"use client";

import { useRouter } from "next/navigation";

export default function DailySessionCreationIntro({ formationTitle }: { formationTitle?: string | null }) {
  const router = useRouter();
  return <section style={styles.wrapper} aria-label="Étape 2 sur 2 — création de la première session"><div style={styles.progressHeader}><div><p style={styles.eyebrow}>Création d’une formation · Étape 2 sur 2</p><h1 style={styles.title}>Planifiez votre première session</h1><p style={styles.text}>{formationTitle ? <>La formation <strong>{formationTitle}</strong> est enregistrée. Vous pouvez maintenant créer sa première session.</> : <>Votre formation est enregistrée. Vous pouvez maintenant créer sa première session.</>}</p></div><div style={styles.stepBadge} aria-hidden="true">2 / 2</div></div><div style={styles.track} aria-hidden="true"><div style={styles.fill} /></div><p style={styles.hint}>La formation existe déjà : vous pouvez quitter cette étape et créer la session plus tard sans perdre votre travail.</p><button type="button" style={styles.secondary} onClick={() => router.push("/client/daily/formations")}>Créer la session plus tard</button></section>;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: "grid", gap: 12, marginBottom: 20, padding: "1.25rem", border: "1px solid #d8b989", borderRadius: 16, background: "#fffaf0", color: "#3f2b1d" }, progressHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }, eyebrow: { margin: 0, fontSize: 11, fontWeight: 800, color: "#8a4b24", letterSpacing: ".11em", textTransform: "uppercase" }, title: { margin: ".3rem 0 .45rem", fontSize: 28 }, text: { margin: 0, color: "#705744", lineHeight: 1.55 }, stepBadge: { minWidth: 62, textAlign: "center", padding: ".65rem .8rem", borderRadius: 999, background: "#f2e3c4", fontWeight: 800 }, track: { height: 7, background: "#eadbc0", borderRadius: 999, overflow: "hidden" }, fill: { width: "100%", height: "100%", background: "#8a4b24" }, hint: { margin: 0, color: "#806a58", fontSize: 13, lineHeight: 1.5 }, secondary: { justifySelf: "start", border: "1px solid #b89965", borderRadius: 10, background: "#fff", color: "#593d27", padding: ".65rem .9rem", fontWeight: 700, cursor: "pointer" },
};
