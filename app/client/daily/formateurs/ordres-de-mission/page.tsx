"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type Trainer = { id: string; display_name?: string; professional_email?: string | null; user_id?: string | null };
type Signature = { mission_order_id: string; signatory_type: "ordering_party" | "trainer"; user_id: string; signatory_name: string; signed_at: string };
type MissionOrder = {
  id: string;
  trainer_profile_id: string;
  ordering_party_user_id: string;
  trainer_user_id: string | null;
  trainer_name: string;
  trainer_email: string | null;
  trainer_address: string | null;
  trainer_siret: string | null;
  order_type: "one_off" | "collaboration";
  start_date: string | null;
  end_date: string | null;
  rate_type: "hourly" | "daily";
  rate_amount: number | string;
  payment_terms: string;
  travel_costs_covered: boolean;
  travel_costs_terms: string | null;
  missions: string[];
  mission_details: string | null;
  qualiopi_process_commitment: boolean;
  issue_place: string;
  issue_date: string;
  status: "pending_signatures" | "partially_signed" | "signed" | "cancelled";
};

const missionLabels: Record<string, string> = {
  conception: "Conception pédagogique",
  animation: "Animation de formation",
  administrative_management: "Gestion administrative",
  evaluation: "Évaluation des acquis",
  learner_followup: "Suivi des apprenants",
};

const statusLabels: Record<MissionOrder["status"], string> = {
  pending_signatures: "En attente des signatures",
  partially_signed: "Une signature sur deux",
  signed: "Signé par les deux parties",
  cancelled: "Annulé",
};

export default function DailyMissionOrdersPage() {
  const [orders, setOrders] = useState<MissionOrder[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [ordersResponse, workspaceResponse] = await Promise.all([
        fetch("/api/client/daily/mission-orders", { cache: "no-store" }),
        fetch("/api/client/daily/workspace", { cache: "no-store" }),
      ]);
      const orderBody = await ordersResponse.json().catch(() => ({}));
      const workspaceBody = await workspaceResponse.json().catch(() => ({}));
      if (!ordersResponse.ok) throw new Error(orderBody.error ?? "Chargement des ordres de mission impossible.");
      setOrders(orderBody.orders ?? []);
      setSignatures(orderBody.signatures ?? []);
      setCanManage(Boolean(orderBody.canManage));
      setCurrentUserId(orderBody.currentUserId ?? null);
      if (workspaceResponse.ok) setTrainers(workspaceBody.workspace?.trainers ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const signaturesByOrder = useMemo(() => {
    const map = new Map<string, Signature[]>();
    for (const signature of signatures) map.set(signature.mission_order_id, [...(map.get(signature.mission_order_id) ?? []), signature]);
    return map;
  }, [signatures]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const missions = values.getAll("missions").map(String);
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/client/daily/mission-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trainer_profile_id: values.get("trainer_profile_id"),
          trainer_address: values.get("trainer_address"),
          trainer_siret: values.get("trainer_siret"),
          order_type: values.get("order_type"),
          start_date: values.get("start_date"),
          end_date: values.get("end_date"),
          rate_type: values.get("rate_type"),
          rate_amount: values.get("rate_amount"),
          payment_terms: values.get("payment_terms"),
          travel_costs_covered: values.get("travel_costs_covered") === "on",
          travel_costs_terms: values.get("travel_costs_terms"),
          missions,
          mission_details: values.get("mission_details"),
          qualiopi_process_commitment: values.get("qualiopi_process_commitment") === "on",
          issue_place: values.get("issue_place"),
          issue_date: values.get("issue_date"),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Création impossible.");
      form.reset(); setShowCreate(false); setMessage("Ordre de mission créé. Il est maintenant prêt pour la double signature.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.");
    } finally { setSaving(false); }
  }

  async function signOrder(orderId: string) {
    const typed = window.prompt("Pour signer, saisissez votre nom et prénom tels qu’ils doivent apparaître sur l’ordre de mission.");
    if (!typed?.trim()) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/client/daily/mission-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", mission_order_id: orderId, signature_data: typed.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Signature impossible.");
      setMessage(body.status === "signed" ? "Ordre de mission signé par les deux parties." : "Votre signature est enregistrée. Il reste une signature à recueillir.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signature impossible.");
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingMascot message="Sélion rassemble les ordres de mission…" />;

  return <main style={s.page}><div style={s.wrap}>
    <header style={s.hero}>
      <p style={s.kicker}>Selen Daily · Formateurs</p>
      <h1 style={s.h1}>Ordres de mission</h1>
      <p style={s.lead}>Formalisez les missions confiées à un formateur ou sous-traitant. L’ordre est figé dès la première signature et n’est considéré comme final qu’après la signature des deux parties.</p>
    </header>
    {error ? <p style={s.error}>{error}</p> : null}
    {message ? <p style={s.success}>{message}</p> : null}

    {canManage ? <section style={s.card}>
      <button type="button" style={s.toggle} onClick={() => setShowCreate((value) => !value)} aria-expanded={showCreate}>
        <span>Créer un ordre de mission</span><span aria-hidden>{showCreate ? "▲" : "▼"}</span>
      </button>
      {showCreate ? <form onSubmit={createOrder} style={s.form}>
        <div style={s.grid}>
          <label style={s.label}>Formateur *<select name="trainer_profile_id" required style={s.input}><option value="">Sélectionner…</option>{trainers.map((trainer) => <option key={trainer.id} value={trainer.id} disabled={!trainer.user_id}>{trainer.display_name || trainer.professional_email || "Formateur"}{!trainer.user_id ? " · accès Daily requis pour signer" : ""}</option>)}</select></label>
          <label style={s.label}>Adresse du formateur *<input name="trainer_address" required style={s.input} /></label>
          <label style={s.label}>SIRET du formateur *<input name="trainer_siret" inputMode="numeric" required style={s.input} /></label>
          <label style={s.label}>Type de mission<select name="order_type" defaultValue="one_off" style={s.input}><option value="one_off">Mission ponctuelle</option><option value="collaboration">Collaboration moyenne / longue durée</option></select></label>
          <label style={s.label}>Début *<input name="start_date" type="date" required style={s.input} /></label>
          <label style={s.label}>Fin *<input name="end_date" type="date" required style={s.input} /></label>
          <label style={s.label}>Tarification *<select name="rate_type" defaultValue="hourly" style={s.input}><option value="hourly">Taux horaire</option><option value="daily">Taux journalier</option></select></label>
          <label style={s.label}>Montant HT *<input name="rate_amount" type="number" min="0" step="0.01" required style={s.input} /></label>
          <label style={{...s.label,gridColumn:"1 / -1"}}>Conditions de paiement *<textarea name="payment_terms" required placeholder="Ex. facture en fin de mois, paiement à 30 jours" style={s.textarea} /></label>
        </div>
        <fieldset style={s.fieldset}><legend style={s.legend}>Missions confiées</legend><div style={s.checkGrid}>{Object.entries(missionLabels).map(([value,label]) => <label key={value} style={s.check}><input type="checkbox" name="missions" value={value} /> {label}</label>)}</div><label style={s.label}>Autre mission ou précision<textarea name="mission_details" style={s.textarea} /></label></fieldset>
        <fieldset style={s.fieldset}><legend style={s.legend}>Déplacements</legend><label style={s.check}><input name="travel_costs_covered" type="checkbox" /> Les frais de déplacement sont pris en charge</label><label style={s.label}>Montant / conditions<textarea name="travel_costs_terms" style={s.textarea} /></label></fieldset>
        <label style={s.check}><input name="qualiopi_process_commitment" type="checkbox" defaultChecked /> Le formateur s’engage à respecter les processus Qualiopi applicables de l’organisme donneur d’ordre lorsqu’il est certifié.</label>
        <div style={s.grid}><label style={s.label}>Établi à *<input name="issue_place" required style={s.input} /></label><label style={s.label}>Le *<input name="issue_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} style={s.input} /></label></div>
        <button type="submit" disabled={saving} style={s.primary}>{saving ? "Enregistrement…" : "Créer l’ordre de mission"}</button>
      </form> : <p style={s.muted}>Le formulaire reste fermé tant que vous n’avez pas d’ordre à préparer.</p>}
    </section> : null}

    <section style={s.card}><h2 style={s.h2}>Ordres de mission</h2>
      {orders.length === 0 ? <p style={s.muted}>Aucun ordre de mission pour le moment.</p> : <div style={s.list}>{orders.map((order) => {
        const orderSignatures = signaturesByOrder.get(order.id) ?? [];
        const alreadySignedByCurrentUser = Boolean(currentUserId && orderSignatures.some((signature) => signature.user_id === currentUserId));
        const canCurrentUserSign = Boolean(currentUserId && (order.ordering_party_user_id === currentUserId || order.trainer_user_id === currentUserId));
        return <article key={order.id} style={s.order}>
          <div style={s.orderHead}><div><strong>{order.trainer_name}</strong><p style={s.muted}>{order.order_type === "one_off" ? "Mission ponctuelle" : "Collaboration"}{order.start_date ? ` · du ${order.start_date}` : ""}{order.end_date ? ` au ${order.end_date}` : ""}</p></div><span style={s.badge}>{statusLabels[order.status]}</span></div>
          <div style={s.summary}><span>{order.rate_amount} € HT / {order.rate_type === "hourly" ? "heure" : "jour"}</span><span>{order.missions.map((mission) => missionLabels[mission] ?? mission).join(" · ") || order.mission_details}</span></div>
          <p style={s.muted}>Signatures : {orderSignatures.length}/2{orderSignatures.length ? ` · ${orderSignatures.map((sig) => `${sig.signatory_type === "ordering_party" ? "donneur d’ordre" : "formateur"} signé le ${new Date(sig.signed_at).toLocaleDateString("fr-FR")}`).join(" · ")}` : ""}</p>
          {alreadySignedByCurrentUser && order.status !== "signed" ? <p style={s.muted}>Votre signature est enregistrée. L’autre partie doit encore signer.</p> : null}
          {canCurrentUserSign && !alreadySignedByCurrentUser && order.status !== "signed" && order.status !== "cancelled" ? <button type="button" disabled={saving} onClick={() => void signOrder(order.id)} style={s.secondary}>Signer cet ordre de mission</button> : null}
          {order.status === "signed" ? <a href={`/api/client/daily/mission-orders/${order.id}/pdf`} style={s.secondary}>Télécharger le PDF signé</a> : null}
        </article>;
      })}</div>}
    </section>
  </div></main>;
}

const s: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",padding:"2rem 1rem 5rem",background:"linear-gradient(180deg,#eadfbf,#e0cf9f)",color:"#392a19"},wrap:{maxWidth:1000,margin:"0 auto",display:"grid",gap:"1rem"},hero:{background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.5rem"},kicker:{textTransform:"uppercase",letterSpacing:".14em",fontSize:11,fontWeight:800,color:"#9b682d"},h1:{fontFamily:"Georgia,serif",fontSize:"clamp(2rem,5vw,3rem)",margin:".4rem 0"},h2:{fontFamily:"Georgia,serif",marginTop:0},lead:{color:"#725e46",lineHeight:1.6},card:{background:"#f8f0dc",border:"1px solid #d9c391",padding:"1.4rem"},toggle:{width:"100%",display:"flex",justifyContent:"space-between",border:0,background:"transparent",fontSize:"1.05rem",fontWeight:800,color:"#392a19",cursor:"pointer",padding:0},form:{display:"grid",gap:"1rem",marginTop:"1rem",paddingTop:"1rem",borderTop:"1px solid #d9c391"},grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:".75rem"},label:{display:"grid",gap:".35rem",fontSize:13,fontWeight:700,color:"#5c4933"},input:{width:"100%",boxSizing:"border-box",minHeight:42,padding:".65rem .7rem",border:"1px solid #c9ae78",background:"white",color:"#392a19"},textarea:{width:"100%",boxSizing:"border-box",minHeight:80,padding:".65rem .7rem",border:"1px solid #c9ae78",background:"white",color:"#392a19",resize:"vertical"},fieldset:{border:"1px solid #d9c391",padding:"1rem",display:"grid",gap:".75rem"},legend:{fontWeight:800,padding:"0 .35rem"},checkGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:".5rem"},check:{fontSize:13,lineHeight:1.5},primary:{width:"fit-content",padding:".75rem 1rem",border:"1px solid #7a2e22",borderRadius:6,background:"#7a2e22",color:"#f8f0dc",fontWeight:800,cursor:"pointer"},secondary:{width:"fit-content",padding:".6rem .85rem",border:"1px solid #7a2e22",background:"transparent",color:"#7a2e22",fontWeight:800,cursor:"pointer",textDecoration:"none"},list:{display:"grid",gap:".75rem"},order:{border:"1px solid rgba(160,106,44,.3)",padding:"1rem",display:"grid",gap:".7rem",background:"rgba(255,255,255,.28)"},orderHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"1rem",flexWrap:"wrap"},summary:{display:"flex",gap:"1rem",flexWrap:"wrap",fontSize:13,fontWeight:700},badge:{fontSize:11,textTransform:"uppercase",background:"#7a2e22",color:"#f8f0dc",padding:".35rem .5rem"},muted:{color:"#806c52",margin:".25rem 0 0",lineHeight:1.5},error:{border:"1px solid #a64b3b",background:"#fff2ee",padding:".8rem",color:"#7d2e22"},success:{border:"1px solid #748c54",background:"#f2f6e8",padding:".8rem",color:"#4f6338"},
};