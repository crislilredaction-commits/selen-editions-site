import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";
import { sendTrainerAnnualReviewManagerEmail } from "@/lib/server/dailyTrainerAnnualReviewEmails";

const currentReviewYear = () => new Date().getUTCFullYear();

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isTrainerRole(roles: string[] | undefined) {
  return Array.isArray(roles) && roles.includes("trainer");
}

async function resolveTrainerProfile(
  organisationId: string,
  userId: string,
  email: string | null | undefined,
) {
  const admin = getAdminSupabase();

  const { data: byUser, error: byUserError } = await admin
    .from("daily_trainer_profiles")
    .select("id,organisation_id,user_id,professional_email,display_name,cv_updated_at,cv_review_due_at")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .limit(2);
  if (byUserError) throw new Error(byUserError.message);
  if ((byUser ?? []).length === 1) return byUser![0];
  if ((byUser ?? []).length > 1) throw new Error("Plusieurs fiches formateur sont rattachées à ce compte. Selen doit les vérifier.");

  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data: byEmail, error: byEmailError } = await admin
    .from("daily_trainer_profiles")
    .select("id,organisation_id,user_id,professional_email,display_name,cv_updated_at,cv_review_due_at")
    .eq("organisation_id", organisationId)
    .ilike("professional_email", normalizedEmail)
    .limit(2);
  if (byEmailError) throw new Error(byEmailError.message);
  if ((byEmail ?? []).length === 1) return byEmail![0];
  if ((byEmail ?? []).length > 1) throw new Error("Plusieurs fiches formateur utilisent cette adresse email. Selen doit les vérifier.");
  return null;
}

async function loadReview(trainerProfileId: string, year: number) {
  const admin = getAdminSupabase();
  const { data: review, error: reviewError } = await admin
    .from("daily_trainer_annual_reviews")
    .select("id,review_year,status,strengths,weaknesses,improvement_areas,proposed_solutions,submitted_at,manager_notified_at,last_reminder_at,reminder_count,next_reminder_at,created_at,updated_at")
    .eq("trainer_profile_id", trainerProfileId)
    .eq("review_year", year)
    .maybeSingle();
  if (reviewError) throw new Error(reviewError.message);

  if (!review?.id) return { review: null, trainings: [] };

  const { data: trainings, error: trainingError } = await admin
    .from("daily_trainer_annual_review_trainings")
    .select("id,training_kind,title,provider,completed_on,attestation_document_id,note,created_at,updated_at")
    .eq("annual_review_id", review.id)
    .order("created_at", { ascending: true });
  if (trainingError) throw new Error(trainingError.message);

  return { review, trainings: trainings ?? [] };
}

async function getContext() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return context;

  if (!isTrainerRole(context.workspace.membership.roles)) {
    return { ok: false as const, status: 403, error: "Le suivi annuel est réservé aux formateurs de l’organisme." };
  }

  const organisationId = context.workspace.membership.organisation_id;
  try {
    const trainer = await resolveTrainerProfile(organisationId, context.user.id, context.user.email);
    if (!trainer) {
      return {
        ok: false as const,
        status: 409,
        error: "Votre compte formateur n’est pas encore rattaché à une fiche formateur. Le responsable de l’organisme peut la compléter dans Daily.",
      };
    }
    return { ...context, trainer, organisationId };
  } catch (error) {
    return {
      ok: false as const,
      status: 409,
      error: error instanceof Error ? error.message : "Identification de la fiche formateur impossible.",
    };
  }
}

export async function GET() {
  const context = await getContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const year = currentReviewYear();
  try {
    const state = await loadReview(context.trainer.id, year);
    return NextResponse.json({
      year,
      trainer: context.trainer,
      review: state.review,
      trainings: state.trainings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chargement du suivi annuel impossible." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const context = await getContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action);
  const year = currentReviewYear();
  const admin = getAdminSupabase();

  try {
    const state = await loadReview(context.trainer.id, year);
    if (state.review?.status === "submitted") {
      return NextResponse.json(
        { error: "Cette auto-évaluation a déjà été transmise. Elle reste consultable mais n’est plus modifiable." },
        { status: 409 },
      );
    }

    if (action === "save_review") {
      const payload = {
        trainer_profile_id: context.trainer.id,
        review_year: year,
        status: "draft",
        strengths: clean(body.strengths) || null,
        weaknesses: clean(body.weaknesses) || null,
        improvement_areas: clean(body.improvement_areas) || null,
        proposed_solutions: clean(body.proposed_solutions) || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = state.review?.id
        ? await admin.from("daily_trainer_annual_reviews").update(payload).eq("id", state.review.id)
        : await admin.from("daily_trainer_annual_reviews").insert(payload);
      if (error) throw new Error(error.message);
    } else if (action === "add_training") {
      const trainingKind = clean(body.training_kind);
      const title = clean(body.title);
      const completedOn = clean(body.completed_on);
      if (!["completed", "planned"].includes(trainingKind)) {
        return NextResponse.json({ error: "Type de formation invalide." }, { status: 400 });
      }
      if (!title) return NextResponse.json({ error: "Le nom de la formation est requis." }, { status: 400 });
      if (trainingKind === "completed" && !completedOn) {
        return NextResponse.json({ error: "La date de fin est requise pour une formation suivie." }, { status: 400 });
      }

      let reviewId = state.review?.id as string | undefined;
      if (!reviewId) {
        const { data: created, error: createError } = await admin
          .from("daily_trainer_annual_reviews")
          .insert({ trainer_profile_id: context.trainer.id, review_year: year, status: "draft" })
          .select("id")
          .single();
        if (createError) throw new Error(createError.message);
        reviewId = created.id;
      }

      const { error } = await admin.from("daily_trainer_annual_review_trainings").insert({
        annual_review_id: reviewId,
        training_kind: trainingKind,
        title,
        provider: clean(body.provider) || null,
        completed_on: trainingKind === "completed" ? completedOn : null,
        note: clean(body.note) || null,
      });
      if (error) throw new Error(error.message);
    } else if (action === "submit_review") {
      if (!state.review?.id) {
        return NextResponse.json({ error: "Enregistrez d’abord votre auto-évaluation." }, { status: 400 });
      }

      const required = [
        ["points forts", state.review.strengths],
        ["points faibles", state.review.weaknesses],
        ["axes d’amélioration", state.review.improvement_areas],
        ["solutions proposées", state.review.proposed_solutions],
      ] as const;
      const missing = required.filter(([, value]) => !clean(value)).map(([label]) => label);
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Complétez les rubriques obligatoires : ${missing.join(", ")}.` },
          { status: 400 },
        );
      }

      const completedWithoutAttestation = state.trainings.filter(
        (training) => training.training_kind === "completed" && !training.attestation_document_id,
      );
      if (completedWithoutAttestation.length > 0) {
        return NextResponse.json(
          { error: "Ajoutez l’attestation de chaque formation suivie avant de transmettre l’auto-évaluation." },
          { status: 400 },
        );
      }

      const submittedAt = new Date().toISOString();
      const { error } = await admin
        .from("daily_trainer_annual_reviews")
        .update({
          status: "submitted",
          submitted_at: submittedAt,
          next_reminder_at: null,
          updated_at: submittedAt,
        })
        .eq("id", state.review.id);
      if (error) throw new Error(error.message);

      const { data: organisation } = await admin
        .from("organisations")
        .select("name,legal_representative_name,legal_representative_email,administrative_email,email")
        .eq("id", context.organisationId)
        .maybeSingle();
      const managerEmail = clean(organisation?.legal_representative_email)
        || clean(organisation?.administrative_email)
        || clean(organisation?.email);
      if (managerEmail) {
        const origin = new URL(req.url).origin;
        const notification = await sendTrainerAnnualReviewManagerEmail({
          email: managerEmail,
          managerName: clean(organisation?.legal_representative_name) || null,
          trainerName: clean(context.trainer.display_name) || "Un formateur",
          reviewYear: year,
          reviewUrl: `${origin}/client/daily/organisation`,
        });
        if (notification.sent) {
          await admin
            .from("daily_trainer_annual_reviews")
            .update({ manager_notified_at: new Date().toISOString() })
            .eq("id", state.review.id)
            .is("manager_notified_at", null);
        }
      }
    } else {
      return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
    }

    const refreshed = await loadReview(context.trainer.id, year);
    return NextResponse.json({ ok: true, year, trainer: context.trainer, ...refreshed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Mise à jour du suivi annuel impossible." },
      { status: 500 },
    );
  }
}
