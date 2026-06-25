import { Suspense } from "react";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ManageAppointmentClient from "@/components/ManageAppointmentClient";

export default function ManageAppointmentPage() {
  return (
    <main className="gazette-paper min-h-screen text-[#3e2a1f]">
      <Header />

      <section className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
        <div className="gazette-masthead-rule justify-center mb-8">
          <span>Gestion de rendez-vous</span>
        </div>

        <Suspense
          fallback={
            <article className="gazette-card p-6 md:p-8">
              <div className="gazette-band" />
              <p style={{ color: "var(--ink-soft)" }}>
                Chargement de votre rendez-vous...
              </p>
            </article>
          }
        >
          <ManageAppointmentClient />
        </Suspense>
      </section>

      <Footer />
    </main>
  );
}
