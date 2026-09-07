import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

const allowedOrderTypes = new Set(["one_off", "collaboration"]);
const allowedRateTypes = new Set(["hourly", "daily"]);
const consentText = "Je confirme avoir lu l’ordre de mission, en accepter les conditions et signer électroniquement ce document.";

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

async function loadVisibleOrders() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;

  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const canManage = Boolean(context.workspace.capabilities.trainers || context.workspace.capabilities.trainers_all);

  let trainerProfileIds: string[] | null = null;
  if (!canManage) {
    const { data: ownProfiles, error: ownProfilesError } = await admin
      .from("daily_trainer_profiles")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("user_id", context.user.id)
      .eq("active", true);
    if (ownProfilesError) throw new Error(ownProfilesError.message);
    trainerProfileIds = (ownProfiles ?? []).map((row) => row.id);
  }

  let query = admin
    .from("daily_mission_orders")
    .select("*")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false });
  if (trainerProfileIds !== null) {
    if (trainerProfileIds.length === 0) {
      return { ok: true as const, context, admin, canManage, orders: [], signatures: [] };
    }
    query = query.in("trainer_profile_id", trainerProfileIds);
  }

  const { data: orders, error } = await query;
  if (error) throw new Error(error.message);
  const orderIds = (orders ?? []).map((row) => row.id);
  let signatures: unknown[] = [];
  if (orderIds.length > 0) {
    const { data, error: signatureError } = await admin
      .from("daily_mission_order_signatures")
      .select("id,mission_order_id,signatory_type,user_id,signatory_name,signatory_email,signed_at,proof_hash")
      .in("mission_order_id", orderIds)
      .order("signed_at", { ascending: true });
    if (signatureError) throw new Error(signatureError.message);
    signatures = data ?? [];
  }

  return { ok: true as const, context, admin, canManage, orders: orders ?? [], signatures };
}

export async function GET() {
  try {
    const visible = await loadVisibleOrders();
    if (!visible.ok) return NextResponse.json({ error: visible.error }, { status: visible.status });
    return NextResponse.json({ orders: visible.orders, signatures: visible.signatures, canManage: visible.canManage });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Chargement des ordres de mission impossible." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.trainers && !context.workspace.capabilities.trainers_all) {
    return NextResponse.json({ error: "Vous n’avez pas le droit de créer un ordre de mission." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const trainerProfileId = cleanText(body.trainer_profile_id);
  const trainerAddress = cleanText(body.trainer_address);
  const trainerSiret = cleanText(body.trainer_siret);
  const orderType = cleanText(body.order_type) ?? "one_off";
  const rateType = cleanText(body.rate_type);
  const rateAmount = Number(body.rate_amount);
  const paymentTerms = cleanText(body.payment_terms);
  const issuePlace = cleanText(body.issue_place);
  const missions = cleanStringArray(body.missions);
  const missionDetails = cleanText(body.mission_details);
  const travelCovered = Boolean(body.travel_costs_covered);
  const travelTerms = cleanText(body.travel_costs_terms);

  if (!trainerProfileId || !rateType || !allowedRateTypes.has(rateType) || !Number.isFinite(rateAmount) || rateAmount < 0 || !paymentTerms || !issuePlace) {
    return NextResponse.json({ error: "Formateur, tarif, conditions de paiement et lieu d’établissement sont requis." }, { status: 400 });
  }
  if (!allowedOrderTypes.has(orderType)) return NextResponse.json({ error: "Type d’ordre de mission invalide." }, { status: 400 });
  if (missions.length === 0 && !missionDetails) return NextResponse.json({ error: "Précisez au moins une mission." }, { status: 400 });
  if (travelCovered && !travelTerms) return NextResponse.json({ error: "Précisez les conditions de prise en charge des déplacements." }, { status: 400 });

  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const { data: trainer, error: trainerError } = await admin
    .from("daily_trainer_profiles")
    .select("id,user_id,display_name,professional_email,active")
    .eq("id", trainerProfileId)
    .eq("organisation_id", organisationId)
    .eq("active", true)
    .maybeSingle();
  if (trainerError) return NextResponse.json({ error: trainerError.message }, { status: 500 });
  if (!trainer) return NextResponse.json({ error: "Formateur introuvable dans votre organisme." }, { status: 404 });

  const startDate = cleanText(body.start_date);
  const endDate = cleanText(body.end_date);
  if (startDate && endDate && endDate < startDate) return NextResponse.json({ error: "La date de fin ne peut pas précéder la date de début." }, { status: 400 });

  const { data: order, error } = await admin
    .from("daily_mission_orders")
    .insert({
      organisation_id: organisationId,
      trainer_profile_id: trainer.id,
      created_by: context.user.id,
      updated_by: context.user.id,
      ordering_party_user_id: context.user.id,
      trainer_user_id: trainer.user_id,
      trainer_name: trainer.display_name,
      trainer_email: trainer.professional_email,
      trainer_address: trainerAddress,
      trainer_siret: trainerSiret,
      order_type: orderType,
      start_date: startDate,
      end_date: endDate,
      session_ids: cleanStringArray(body.session_ids),
      rate_type: rateType,
      rate_amount: rateAmount,
      payment_terms: paymentTerms,
      travel_costs_covered: travelCovered,
      travel_costs_terms: travelCovered ? travelTerms : null,
      missions,
      mission_details: missionDetails,
      qualiopi_process_commitment: body.qualiopi_process_commitment !== false,
      issue_place: issuePlace,
      issue_date: cleanText(body.issue_date) ?? new Date().toISOString().slice(0, 10),
      status: "pending_signatures",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order }, { status: 201 });
}

export async function PATCH(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await req.json().catch(() => ({}));
  if (body.action !== "sign") return NextResponse.json({ error: "Action non prise en charge." }, { status: 400 });

  const missionOrderId = cleanText(body.mission_order_id);
  const signatureData = cleanText(body.signature_data);
  if (!missionOrderId || !signatureData) return NextResponse.json({ error: "Ordre de mission et signature sont requis." }, { status: 400 });

  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const { data: order, error } = await admin
    .from("daily_mission_orders")
    .select("*")
    .eq("id", missionOrderId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Ordre de mission introuvable." }, { status: 404 });
  if (order.status === "cancelled") return NextResponse.json({ error: "Cet ordre de mission est annulé." }, { status: 409 });

  let signatoryType: "ordering_party" | "trainer" | null = null;
  let signatoryName = context.user.email ?? "Signataire";
  let signatoryEmail = context.user.email ?? null;
  if (order.ordering_party_user_id === context.user.id) {
    signatoryType = "ordering_party";
  } else {
    const { data: trainer } = await admin
      .from("daily_trainer_profiles")
      .select("id,display_name,professional_email,user_id")
      .eq("id", order.trainer_profile_id)
      .eq("organisation_id", organisationId)
      .maybeSingle();
    if (trainer?.user_id === context.user.id) {
      signatoryType = "trainer";
      signatoryName = trainer.display_name;
      signatoryEmail = trainer.professional_email ?? context.user.email ?? null;
    }
  }
  if (!signatoryType) return NextResponse.json({ error: "Vous n’êtes pas signataire de cet ordre de mission." }, { status: 403 });

  const signedAt = new Date().toISOString();
  const proofPayload = JSON.stringify({
    mission_order_id: order.id,
    organisation_id: order.organisation_id,
    trainer_profile_id: order.trainer_profile_id,
    trainer_name: order.trainer_name,
    trainer_siret: order.trainer_siret,
    order_type: order.order_type,
    start_date: order.start_date,
    end_date: order.end_date,
    rate_type: order.rate_type,
    rate_amount: order.rate_amount,
    payment_terms: order.payment_terms,
    travel_costs_covered: order.travel_costs_covered,
    travel_costs_terms: order.travel_costs_terms,
    missions: order.missions,
    mission_details: order.mission_details,
    qualiopi_process_commitment: order.qualiopi_process_commitment,
    issue_place: order.issue_place,
    issue_date: order.issue_date,
    signatory_type: signatoryType,
    user_id: context.user.id,
    signed_at: signedAt,
  });
  const proofHash = createHash("sha256").update(proofPayload).digest("hex");

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const { error: signatureError } = await admin.from("daily_mission_order_signatures").insert({
    mission_order_id: order.id,
    signatory_type: signatoryType,
    user_id: context.user.id,
    signatory_name: signatoryName,
    signatory_email: signatoryEmail,
    consent_text: consentText,
    signature_data: signatureData,
    proof_hash: proofHash,
    signed_at: signedAt,
    ip_address: forwardedFor,
    user_agent: req.headers.get("user-agent"),
  });
  if (signatureError) {
    if (signatureError.code === "23505") return NextResponse.json({ error: "Cette partie a déjà signé l’ordre de mission." }, { status: 409 });
    return NextResponse.json({ error: signatureError.message }, { status: 500 });
  }

  const { data: signatures, error: countError } = await admin
    .from("daily_mission_order_signatures")
    .select("signatory_type")
    .eq("mission_order_id", order.id);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  const signedTypes = new Set((signatures ?? []).map((row) => row.signatory_type));
  const fullySigned = signedTypes.has("ordering_party") && signedTypes.has("trainer");
  const { error: updateError } = await admin
    .from("daily_mission_orders")
    .update({
      status: fullySigned ? "signed" : "partially_signed",
      locked_at: order.locked_at ?? signedAt,
      updated_by: context.user.id,
    })
    .eq("id", order.id)
    .eq("organisation_id", organisationId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: fullySigned ? "signed" : "partially_signed", proof_hash: proofHash });
}
