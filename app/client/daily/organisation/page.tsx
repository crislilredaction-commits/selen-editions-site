"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

type Tab = "organisation" | "users" | "trainers" | "validations";
type UserRow = {
  membership_id: string; user_id: string; email?: string | null; full_name?: string | null;
  status: string; primary_role?: string | null; roles: string[]; permission_blocks: string[];
};
type Invitation = {
  id: string; invited_email: string; status: string; intended_roles: string[];
  intended_permission_blocks: string[]; expires_at: string; created_at: string;
};
type Certification = {
  id: string; trainer_profile_id: string; title: string; issuer?: string | null; reference?: string | null;
  obtained_on?: string | null; validity_mode: "lifetime" | "limited" | "unknown"; valid_until?: string | null; note?: string | null;
};
type Trainer = {
  id: string; display_name: string; professional_email?: string | null; phone?: string | null;
  biography?: string | null; specialties?: string[]; engagement_type: string; status: string;
  user_id?: string | null; certifications?: Certification[];
};
type ChangeRequest = {
  id: string; request_type: string; proposed_changes: Record<string, unknown>; status: string;
  requested_at: string; review_message?: string | null;
};
type Workspace = {
  organisation: Record<string, unknown>;
  membership: { id: string; organisation_id: string; roles: string[]; permission_blocks: string[] };
  capabilities: { users: boolean; trainers: boolean; trainer_self: boolean; legal_profile: boolean; permanent_documents: boolean };
  users: UserRow[]; invitations: Invitation[]; trainers: Trainer[]; profile_change_requests: ChangeRequest[];
};

const roleLabels: Record<string, string> = { manager: "Responsable", trainer: "Formateur", admin_assistant: "Assistant administratif" };
const blockLabels: Record<string, string> = { users: "Utilisateurs", trainers: "Formateurs", legal_profile: "Profil légal", permanent_documents: "Documents permanents" };

export default function DailyOrganisationClientPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("organisation");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/client/daily/workspace", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Chargement de l’organisme impossible.");
    setWorkspace(data.workspace as Workspace);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = "/client/login"; return; }
      try { await load(); } catch (err) { setError(err instanceof Error ? err.message : "Chargement impossible."); }
      finally { setLoading(false); }
    });
  }, [load, supabase]);

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/client/daily/workspace", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setError(data?.error ?? "L’action n’a pas abouti."); return false; }
    if (data?.workspace) setWorkspace(data.workspace as Workspace); else await load();
    setMessage(success); return true;
  }

  async function invitation(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/client/daily/workspace/invitations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) { setError(data?.error ?? "L’invitation n’a pas abouti."); return; }
    await load();
    setMessage(data?.warning ? `${success} ${data.warning}` : success);
  }

  if (loading) return <main className="gazette-paper" style={s.page}><p>Ouverture de votre organisme...</p></main>;
  if (!workspace) return <main className="gazette-paper" style={s.page}><Link href="/client/daily">← Daily</Link><section style={s.card}><h1>Mon organisme</h1><p style={s.error}>{error}</p></section></main>;

  const org = workspace.organisation;
  const expiring = workspace.trainers.flatMap((trainer) => (trainer.certifications ?? []).map((cert) => ({ trainer, cert })))
    .filter(({ cert }) => cert.validity_mode === "limited" && cert.valid_until && daysUntil(cert.valid_until) <= 90);
  const pending = workspace.profile_change_requests.filter((item) => item.status === "pending");

  return (
    <main className="gazette-paper" style={s.page}>
      <Link href="/client/daily" style={s.back}>← Formations et sessions</Link>
      <header className="gazette-cta" style={s.hero}>
        <p className="gazette-label">Selen Daily · Mon organisme</p>
        <h1 className="gazette-hero-title">{String(org.legal_name || org.name || "Mon organisme")}</h1>
        <p style={s.heroText}>Gérez les informations permanentes, les accès et les formateurs. Les données sensibles restent validées par Selen.</p>
      </header>

      <section style={s.stats}>
        <Stat label="Utilisateurs" value={String(workspace.users.length)} />
        <Stat label="Formateurs" value={String(workspace.trainers.length)} />
        <Stat label="Validations Selen" value={String(pending.length)} warn={pending.length > 0} />
        <Stat label="Échéances ≤ 90 j" value={String(expiring.length)} warn={expiring.length > 0} />
      </section>

      <nav style={s.tabs}>
        <TabButton active={tab === "organisation"} onClick={() => setTab("organisation")}>Mon organisme</TabButton>
        {workspace.capabilities.users ? <TabButton active={tab === "users"} onClick={() => setTab("users")}>Utilisateurs</TabButton> : null}
        {(workspace.capabilities.trainers || workspace.capabilities.trainer_self) ? <TabButton active={tab === "trainers"} onClick={() => setTab("trainers")}>Formateurs</TabButton> : null}
        {workspace.capabilities.legal_profile ? <TabButton active={tab === "validations"} onClick={() => setTab("validations")}>Validations</TabButton> : null}
      </nav>

      {message ? <p style={s.success}>{message}</p> : null}
      {error ? <p style={s.error}>{error}</p> : null}

      {tab === "organisation" ? <OrganisationTab workspace={workspace} busy={busy} patch={patch} /> : null}
      {tab === "users" && workspace.capabilities.users ? <UsersTab workspace={workspace} busy={busy} patch={patch} invitation={invitation} /> : null}
      {tab === "trainers" ? <TrainersTab workspace={workspace} busy={busy} patch={patch} /> : null}
      {tab === "validations" && workspace.capabilities.legal_profile ? <ValidationsTab workspace={workspace} /> : null}
    </main>
  );
}

function OrganisationTab({ workspace, busy, patch }: { workspace: Workspace; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const org = workspace.organisation;
  return <div style={s.grid}>
    <section style={s.card}>
      <h2 style={s.title}>Coordonnées administratives</h2>
      <form style={s.form} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "update_safe_profile", values: Object.fromEntries(f) }, "Coordonnées mises à jour."); }}>
        <Field name="administrative_email" type="email" label="Email administratif" defaultValue={value(org.administrative_email || org.email)} />
        <Field name="administrative_phone" label="Téléphone" defaultValue={value(org.administrative_phone || org.phone)} />
        <Field name="administrative_address" label="Adresse" defaultValue={value(org.administrative_address || org.address)} />
        <button className="btn-ink" disabled={busy}><span>Enregistrer</span></button>
      </form>
    </section>
    {workspace.capabilities.legal_profile ? <section style={s.card}>
      <h2 style={s.title}>Identité juridique</h2>
      <Info label="Raison sociale" value={org.legal_name} /><Info label="SIRET" value={org.siret} /><Info label="Forme juridique" value={org.legal_form} /><Info label="TVA" value={org.vat_number} />
      <Info label="NDA" value={org.nda_number} /><Info label="Statut NDA" value={org.nda_status} /><Info label="Qualiopi" value={org.qualiopi_status} />
      <p style={s.muted}>Ces informations sont sensibles. Toute modification est envoyée à Selen pour validation.</p>
      <SensitiveChangeForms org={org} busy={busy} patch={patch} />
    </section> : null}
  </div>;
}

function SensitiveChangeForms({ org, busy, patch }: { org: Record<string, unknown>; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  return <div style={s.stack}>
    <form style={s.compactForm} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "request_profile_change", request_type: "legal_identity", values: Object.fromEntries(f) }, "Modification envoyée à Selen."); }}>
      <Field name="legal_name" label="Nouvelle raison sociale" defaultValue={value(org.legal_name)} /><button className="btn-ghost" disabled={busy}><span>Demander la modification</span></button>
    </form>
    <form style={s.compactForm} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "request_profile_change", request_type: "legal_representative", values: Object.fromEntries(f) }, "Représentant légal envoyé à Selen."); }}>
      <Field name="legal_representative_name" label="Représentant légal" defaultValue={value(org.legal_representative_name)} /><Field name="legal_representative_email" type="email" label="Email" defaultValue={value(org.legal_representative_email)} /><button className="btn-ghost" disabled={busy}><span>Soumettre</span></button>
    </form>
    <form style={s.compactForm} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "request_profile_change", request_type: "nda", values: Object.fromEntries(f) }, "Informations NDA envoyées à Selen."); }}>
      <Field name="nda_number" label="N° NDA" defaultValue={value(org.nda_number)} /><select name="nda_status" defaultValue={value(org.nda_status) || "unknown"} style={s.input}><option value="unknown">À confirmer</option><option value="pending">En cours</option><option value="active">Actif</option><option value="inactive">Inactif</option></select><button className="btn-ghost" disabled={busy}><span>Soumettre</span></button>
    </form>
  </div>;
}

function UsersTab({ workspace, busy, patch, invitation }: { workspace: Workspace; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean>; invitation: (body: Record<string, unknown>, success: string) => Promise<void> }) {
  return <div style={s.stack}>
    <section style={s.card}>
      <h2 style={s.title}>Inviter un utilisateur</h2>
      <form style={s.form} onSubmit={(e) => {
        e.preventDefault(); const f = new FormData(e.currentTarget);
        const roles = f.getAll("roles").map(String); const permission_blocks = f.getAll("blocks").map(String);
        void invitation({ action: "create", email: f.get("email"), roles, permission_blocks }, "Invitation créée.");
      }}>
        <Field name="email" type="email" label="Adresse email" required />
        <Checkboxes name="roles" title="Rôles" options={[['trainer','Formateur'],['admin_assistant','Assistant administratif']]} />
        <Checkboxes name="blocks" title="Accès complémentaires" options={workspace.membership.permission_blocks.map((block) => [block, blockLabels[block] || block])} />
        <p style={s.muted}>Un autre responsable ne peut pas être créé depuis l’espace client : ce rôle reste attribué par Selen.</p>
        <button className="btn-ink" disabled={busy}><span>Envoyer l’invitation</span></button>
      </form>
    </section>
    <section style={s.card}><h2 style={s.title}>Utilisateurs actifs</h2>{workspace.users.map((user) => <UserEditor key={user.membership_id} user={user} currentMembershipId={workspace.membership.id} allowedBlocks={workspace.membership.permission_blocks} busy={busy} patch={patch} />)}</section>
    <section style={s.card}><h2 style={s.title}>Invitations</h2>{workspace.invitations.length === 0 ? <p style={s.muted}>Aucune invitation.</p> : workspace.invitations.map((invite) => <div key={invite.id} style={s.row}><div><strong>{invite.invited_email}</strong><p style={s.muted}>{invite.intended_roles.map((r) => roleLabels[r] || r).join(", ")} · {invite.status}</p></div>{invite.status === "pending" ? <div style={s.actions}><button className="btn-ghost" disabled={busy} onClick={() => void invitation({ action: "resend", invitation_id: invite.id }, "Invitation renvoyée.")}><span>Renvoyer</span></button><button style={s.dangerButton} disabled={busy} onClick={() => void invitation({ action: "revoke", invitation_id: invite.id }, "Invitation révoquée.")}>Révoquer</button></div> : null}</div>)}</section>
  </div>;
}

function UserEditor({ user, currentMembershipId, allowedBlocks, busy, patch }: { user: UserRow; currentMembershipId: string; allowedBlocks: string[]; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const isSelf = user.membership_id === currentMembershipId; const isManager = user.roles.includes("manager");
  return <div style={s.row}><div style={{ flex: 1 }}><strong>{user.full_name || user.email || "Utilisateur"}</strong><p style={s.muted}>{user.email} · {user.roles.map((r) => roleLabels[r] || r).join(", ")} · {user.status}</p>
    {!isSelf && !isManager ? <form style={s.compactForm} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "set_user_access", membership_id: user.membership_id, roles: f.getAll("roles").map(String), permission_blocks: f.getAll("blocks").map(String) }, "Accès utilisateur mis à jour."); }}>
      <Checkboxes name="roles" title="Rôles" options={[['trainer','Formateur'],['admin_assistant','Assistant administratif']]} defaults={user.roles} />
      <Checkboxes name="blocks" title="Permissions" options={allowedBlocks.map((block) => [block, blockLabels[block] || block])} defaults={user.permission_blocks} />
      <button className="btn-ghost" disabled={busy}><span>Mettre à jour les accès</span></button>
    </form> : null}
  </div>{!isSelf && !isManager ? <button style={user.status === "active" ? s.dangerButton : s.smallButton} disabled={busy} onClick={() => void patch({ action: "set_user_status", membership_id: user.membership_id, status: user.status === "active" ? "disabled" : "active" }, user.status === "active" ? "Utilisateur désactivé." : "Utilisateur réactivé.")}>{user.status === "active" ? "Désactiver" : "Réactiver"}</button> : null}</div>;
}

function TrainersTab({ workspace, busy, patch }: { workspace: Workspace; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  return <div style={s.stack}>
    {workspace.capabilities.trainers ? <TrainerForm busy={busy} patch={patch} /> : null}
    {workspace.trainers.length === 0 ? <section style={s.card}><p>Aucun formateur enregistré.</p></section> : workspace.trainers.map((trainer) => <section key={trainer.id} style={s.card}>
      <div style={s.row}><div><h2 style={s.title}>{trainer.display_name}</h2><p style={s.muted}>{trainer.professional_email || "Email non renseigné"} · {trainer.status}</p></div></div>
      <TrainerForm trainer={trainer} busy={busy} patch={patch} />
      <div style={s.stack}><h3>Certifications et habilitations</h3>{(trainer.certifications ?? []).map((cert) => <div key={cert.id} style={s.row}><div><strong>{cert.title}</strong><p style={s.muted}>{cert.issuer || "Organisme non renseigné"} · {certificationLabel(cert)}</p></div><button style={s.dangerButton} disabled={busy} onClick={() => void patch({ action: "delete_certification", id: cert.id }, "Certification supprimée.")}>Supprimer</button></div>)}</div>
      <CertificationForm trainerId={trainer.id} busy={busy} patch={patch} />
    </section>)}
  </div>;
}

function TrainerForm({ trainer, busy, patch }: { trainer?: Trainer; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  return <form style={s.form} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); void patch({ action: "save_trainer", id: trainer?.id || undefined, display_name: f.get("display_name"), professional_email: f.get("professional_email"), phone: f.get("phone"), biography: f.get("biography"), specialties: String(f.get("specialties") || "").split(",").map((x) => x.trim()).filter(Boolean), engagement_type: f.get("engagement_type"), status: f.get("submit_for_review") ? "pending_selen_review" : "draft" }, trainer ? "Profil formateur mis à jour." : "Formateur ajouté."); }}>
    {!trainer ? <h2 style={s.title}>Ajouter un formateur</h2> : null}
    <Field name="display_name" label="Nom affiché" defaultValue={trainer?.display_name} required /><Field name="professional_email" type="email" label="Email professionnel" defaultValue={trainer?.professional_email ?? ""} /><Field name="phone" label="Téléphone" defaultValue={trainer?.phone ?? ""} />
    <label>Type de relation<select name="engagement_type" defaultValue={trainer?.engagement_type || "external"} style={s.input}><option value="internal">Interne</option><option value="employee">Salarié</option><option value="subcontractor">Sous-traitant</option><option value="external">Externe</option></select></label>
    <Field name="specialties" label="Spécialités, séparées par des virgules" defaultValue={(trainer?.specialties ?? []).join(", ")} /><label>Présentation<textarea name="biography" defaultValue={trainer?.biography ?? ""} style={s.textarea} /></label>
    <label style={s.check}><input type="checkbox" name="submit_for_review" value="1" /> Envoyer ce profil à Selen pour validation</label>
    <button className="btn-ghost" disabled={busy}><span>{trainer ? "Enregistrer le profil" : "Ajouter le formateur"}</span></button>
  </form>;
}

function CertificationForm({ trainerId, busy, patch }: { trainerId: string; busy: boolean; patch: (body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  return <form style={s.certForm} onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const ok = await patch({ action: "save_certification", trainer_profile_id: trainerId, title: f.get("title"), issuer: f.get("issuer"), reference: f.get("reference"), obtained_on: f.get("obtained_on"), validity_mode: f.get("validity_mode"), valid_until: f.get("valid_until"), note: f.get("note") }, "Certification ajoutée."); if (ok) e.currentTarget.reset(); }}>
    <h3>Ajouter une certification</h3><Field name="title" label="Certification / habilitation" required /><Field name="issuer" label="Organisme certificateur" /><Field name="reference" label="Référence" /><Field name="obtained_on" type="date" label="Date d’obtention" />
    <label>Validité<select name="validity_mode" defaultValue="unknown" style={s.input}><option value="unknown">Non renseignée</option><option value="lifetime">À vie</option><option value="limited">Durée limitée</option></select></label><Field name="valid_until" type="date" label="Fin de validité, si durée limitée" /><Field name="note" label="Note" /><button className="btn-ghost" disabled={busy}><span>Ajouter</span></button>
  </form>;
}

function ValidationsTab({ workspace }: { workspace: Workspace }) {
  return <section style={s.card}><h2 style={s.title}>Demandes de validation Selen</h2>{workspace.profile_change_requests.length === 0 ? <p style={s.muted}>Aucune demande envoyée.</p> : workspace.profile_change_requests.map((item) => <div key={item.id} style={s.row}><div><strong>{item.request_type}</strong><p style={s.muted}>{new Date(item.requested_at).toLocaleDateString("fr-FR")} · {item.status}</p><pre style={s.pre}>{JSON.stringify(item.proposed_changes, null, 2)}</pre>{item.review_message ? <p>{item.review_message}</p> : null}</div></div>)}</section>;
}

function Stat({ label, value: content, warn = false }: { label: string; value: string; warn?: boolean }) { return <section style={s.stat}><span style={s.muted}>{label}</span><strong style={{ fontSize: 24, color: warn ? "#9d5c1f" : "var(--ink)" }}>{content}</strong></section>; }
function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) { return <button onClick={onClick} style={{ ...s.tab, ...(active ? s.activeTab : {}) }}>{children}</button>; }
function Field({ name, label, type = "text", defaultValue = "", required = false }: { name: string; label: string; type?: string; defaultValue?: string | null; required?: boolean }) { return <label>{label}<input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} style={s.input} /></label>; }
function Info({ label, value: content }: { label: string; value: unknown }) { return <div style={s.info}><span style={s.muted}>{label}</span><strong>{value(content) || "—"}</strong></div>; }
function Checkboxes({ name, title, options, defaults = [] }: { name: string; title: string; options: string[][]; defaults?: string[] }) { return <fieldset style={s.fieldset}><legend>{title}</legend>{options.map(([key,label]) => <label key={key} style={s.check}><input type="checkbox" name={name} value={key} defaultChecked={defaults.includes(key)} /> {label}</label>)}</fieldset>; }
function value(input: unknown) { return input == null ? "" : String(input); }
function daysUntil(date: string) { return Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date().setHours(0,0,0,0)) / 86_400_000); }
function certificationLabel(cert: Certification) { if (cert.validity_mode === "lifetime") return "Valable à vie"; if (cert.validity_mode === "unknown") return "Validité non renseignée"; if (!cert.valid_until) return "Date de fin à renseigner"; const days = daysUntil(cert.valid_until); return days < 0 ? `Expirée depuis ${Math.abs(days)} j` : days === 0 ? "Expire aujourd’hui" : `Expire dans ${days} j`; }

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", maxWidth: 1160, margin: "0 auto", padding: "2rem 1rem 4rem", color: "var(--ink)" },
  back: { color: "var(--rust)", textDecoration: "none" }, hero: { marginTop: "1rem", padding: "2rem" }, heroText: { color: "var(--sepia-mid)", maxWidth: 760 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".8rem", margin: "1rem 0" }, stat: { display: "grid", gap: ".35rem", background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1rem" },
  tabs: { display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }, tab: { padding: ".7rem 1rem", border: "1px solid var(--sepia-mid)", background: "var(--paper)", cursor: "pointer", color: "var(--ink)" }, activeTab: { borderBottom: "3px solid var(--ocre-gold)", background: "rgba(201,160,85,.12)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "1rem" }, stack: { display: "grid", gap: "1rem" }, card: { background: "var(--paper)", border: "1px solid var(--sepia-mid)", padding: "1.25rem" }, title: { color: "var(--ink)", marginBottom: ".8rem" }, form: { display: "grid", gap: ".8rem" }, compactForm: { display: "grid", gap: ".65rem", borderTop: "1px solid var(--sepia-mid)", paddingTop: ".8rem", marginTop: ".8rem" }, certForm: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".7rem", borderTop: "1px solid var(--sepia-mid)", marginTop: "1rem", paddingTop: "1rem" },
  input: { display: "block", width: "100%", marginTop: ".3rem", padding: ".7rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,.7)", color: "var(--ink)" }, textarea: { width: "100%", minHeight: 90, marginTop: ".3rem", padding: ".7rem", border: "1px solid var(--sepia-mid)", background: "rgba(255,255,255,.7)" },
  row: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", padding: ".85rem 0", borderBottom: "1px solid rgba(120,90,50,.16)" }, info: { display: "flex", justifyContent: "space-between", gap: "1rem", padding: ".5rem 0", borderBottom: "1px solid rgba(120,90,50,.12)" }, actions: { display: "flex", gap: ".5rem", flexWrap: "wrap" },
  fieldset: { border: "1px solid var(--sepia-mid)", padding: ".7rem" }, check: { display: "flex", gap: ".45rem", alignItems: "center", margin: ".25rem 0" }, muted: { color: "var(--ink-faint)", fontSize: ".9rem" }, success: { padding: ".8rem", background: "rgba(52,120,77,.1)", color: "#2e6d47" }, error: { padding: ".8rem", background: "rgba(157,47,47,.08)", color: "#9d2f2f" }, dangerButton: { border: "1px solid #b75b5b", color: "#8d3030", background: "transparent", padding: ".55rem .7rem", cursor: "pointer" }, smallButton: { border: "1px solid var(--sepia-mid)", background: "transparent", padding: ".55rem .7rem", cursor: "pointer" }, pre: { whiteSpace: "pre-wrap", fontSize: ".8rem", background: "rgba(120,90,50,.06)", padding: ".6rem" },
};
