import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

export async function GET() {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.trainers_all) {
    return NextResponse.json({ error: "Vous n’avez pas accès au suivi de l’ensemble des formateurs." }, { status: 403 });
  }

  const organisationId = context.workspace.membership.organisation_id;
  const year = new Date().getUTCFullYear();
  const admin = getAdminSupabase();

  const [{ data: trainers, error: trainerError }, { data: reviews, error: reviewError }] = await Promise.all([
    admin
      .from("daily_trainer_profiles")
      .select("id,display_name,professional_email,status,specialties,cv_updated_at,cv_review_due_at")
      .eq("organisation_id", organisationId)
      .order("display_name", { ascending: true }),
    admin
      .from("daily_trainer_annual_reviews")
      .select("id,trainer_profile_id,review_year,status,strengths,weaknesses,improvement_areas,proposed_solutions,submitted_at,manager_notified_at,reminder_count,next_reminder_at")
      .eq("review_year", year),
  ]);

  const error = trainerError ?? reviewError;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trainerIds = new Set((trainers ?? []).map((trainer) => trainer.id));
  const organisationReviews = (reviews ?? []).filter((review) => trainerIds.has(review.trainer_profile_id));
  const reviewIds = organisationReviews.map((review) => review.id);

  let trainings: Array<Record<string, unknown>> = [];
  if (reviewIds.length > 0) {
    const { data, error: trainingError } = await admin
      .from("daily_trainer_annual_review_trainings")
      .select("id,annual_review_id,training_kind,title,provider,completed_on,attestation_document_id,note")
      .in("annual_review_id", reviewIds)
      .order("created_at", { ascending: true });
    if (trainingError) return NextResponse.json({ error: trainingError.message }, { status: 500 });
    trainings = data ?? [];
  }

  const reviewByTrainer = new Map(organisationReviews.map((review) => [review.trainer_profile_id, review]));
  const trainingsByReview = new Map<string, Array<Record<string, unknown>>>();
  for (const training of trainings) {
    const reviewId = String(training.annual_review_id ?? "");
    const list = trainingsByReview.get(reviewId) ?? [];
    list.push(training);
    trainingsByReview.set(reviewId, list);
  }

  return NextResponse.json({
    year,
    trainers: (trainers ?? []).map((trainer) => {
      const review = reviewByTrainer.get(trainer.id) ?? null;
      return {
        ...trainer,
        review,
        trainings: review?.id ? trainingsByReview.get(review.id) ?? [] : [],
      };
    }),
  });
}
