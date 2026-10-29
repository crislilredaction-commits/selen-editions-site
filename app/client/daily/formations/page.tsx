import Link from "next/link";
import DailyFormationsManager from "@/components/daily/DailyFormationsManager";
import "./formations.css";

export default function DailyFormationsPage() {
  return <div className="daily-formations-compact">
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 18px 0", display: "flex", justifyContent: "flex-end" }}>
      <Link href="/client/daily/formations/new" style={{ padding: "10px 16px", borderRadius: 10, background: "#3d2d26", color: "white", textDecoration: "none", fontWeight: 800 }}>+ Créer une formation</Link>
    </div>
    <DailyFormationsManager />
  </div>;
}
