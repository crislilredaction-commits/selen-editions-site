import Link from "next/link";
import DailySessionsManager from "@/components/daily/DailySessionsManager";

export default function DailySessionsPage() {
  return <div className="space-y-4">
    <div className="flex justify-end px-4 pt-4"><Link href="/client/daily/satisfaction-of" className="rounded-lg border px-3 py-2 text-sm font-semibold">Donner mon avis sur Selen Daily</Link></div>
    <DailySessionsManager />
  </div>;
}
