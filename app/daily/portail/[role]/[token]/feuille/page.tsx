export default async function LearnerAttendanceCopy({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ enrolment?: string }>;
}) {
  const { token } = await params;
  const { enrolment } = await searchParams;
  const query = new URLSearchParams({ enrolment: enrolment ?? "", copy: "learner" });
  return (
    <main className="gazette-paper mx-auto max-w-2xl px-6 py-12">
      <h1 className="gazette-hero-title">Ma feuille d’émargement</h1>
      <p className="my-4">Téléchargez votre feuille individuelle avec vos signatures pour chaque demi-journée.</p>
      <a className="underline" href={`/api/daily-portal/${encodeURIComponent(token)}/personal-attendance?${query}`}>Télécharger mon PDF</a>
    </main>
  );
}
