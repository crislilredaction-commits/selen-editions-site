import AppointmentBooking from "@/components/AppointmentBooking";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  name: string,
) {
  const value = searchParams[name];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeAppointmentType(value?: string | null) {
  if (
    value === "simple_30" ||
    value === "audit_3h30" ||
    value === "audit_2x1h45" ||
    value === "daily_setup_1h30"
  ) {
    return value;
  }

  return "simple_30";
}

export default async function PrendreRendezVousPage({
  searchParams,
}: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const source =
    getParam(resolvedSearchParams, "source") === "client_space"
      ? "client_space"
      : "public_site";
  const requestedType = normalizeAppointmentType(
    getParam(resolvedSearchParams, "appointmentType"),
  );
  const dossierId = getParam(resolvedSearchParams, "dossierId") ?? null;
  const rescheduleToken =
    getParam(resolvedSearchParams, "rescheduleToken") ?? null;
  const isReschedule = getParam(resolvedSearchParams, "rescheduled") === "1";
  const allowedAppointmentTypes =
    source === "client_space"
      ? (["audit_3h30", "audit_2x1h45", "daily_setup_1h30"] as const)
      : (["simple_30"] as const);
  const defaultAppointmentType =
    source === "client_space" && requestedType !== "simple_30"
      ? requestedType
      : "simple_30";

  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-masthead-rule justify-center mb-8">
          <span>Rendez-vous Selen</span>
        </div>

        <div className="gazette-hero-border px-3 md:px-4 py-8 md:py-10 text-center relative mb-8">
          <p className="gazette-label mx-auto w-fit mb-4">
            {source === "client_space" ? "Espace client" : "Appel simple"}
          </p>
          <h1 className="gazette-hero-title text-4xl md:text-6xl">
            Prendre rendez-vous
          </h1>
          <p
            className="mt-5 max-w-2xl mx-auto"
            style={{ color: "var(--ink-soft)", lineHeight: 1.7 }}
          >
            {source === "client_space"
              ? "Choisissez votre format d'audit blanc et le ou les creneaux qui vous conviennent."
              : "Choisissez un creneau de 30 minutes pour un rendez-vous telephonique avec Selen."}
          </p>
        </div>

        <AppointmentBooking
          source={source}
          defaultAppointmentType={defaultAppointmentType}
          allowedAppointmentTypes={[...allowedAppointmentTypes]}
          dossierId={dossierId}
          rescheduleToken={rescheduleToken}
        />

        {isReschedule && (
          <p
            className="mt-5 text-center"
            style={{ color: "var(--ink-soft)", lineHeight: 1.6 }}
          >
            Choisissez un nouveau creneau ci-dessus. Votre ancien rendez-vous
            restera confirme tant que cette nouvelle reservation n'est pas
            finalisee.
          </p>
        )}
      </section>

      <Footer />
    </main>
  );
}
