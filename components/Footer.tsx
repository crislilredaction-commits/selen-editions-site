import Link from "next/link";

export default function Footer() {
  return (
    <footer className="gazette-footer">
      {/* Ornamental header band */}
      <div className="border-b border-[#b28a62]/30 px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="gazette-masthead-rule justify-center">
            <span className="font-['Cinzel'] text-[0.6rem] uppercase tracking-[0.5em] text-[#8a6243]">
              Selen Editions · Gazette officielle
            </span>
          </div>
        </div>
      </div>

      {/* 3-column footer content */}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-10 md:grid-cols-3 md:gap-6">
          {/* Column 1 — À propos */}
          <div className="relative pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-transparent before:via-[#b28a62]/40 before:to-transparent">
            <p className="gazette-label mb-4">À propos</p>
            <p className="font-['Playfair_Display'] text-xl font-semibold text-[#3e2a1f] leading-snug">
              Selen Editions ✨
            </p>
            <p className="mt-3 text-[0.93rem] leading-7 text-[#6e4a32]">
              Petite équipe française spécialisée dans la gestion administrative
              des organismes de formation et la certification Qualiopi.
            </p>
            <p className="mt-3 gazette-byline">Fondée en 2017 · Paris</p>
          </div>

          {/* Column 2 — Navigation */}
          <div className="relative pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-transparent before:via-[#b28a62]/40 before:to-transparent">
            <p className="gazette-label mb-4">Rubriques</p>
            <nav className="flex flex-col gap-2.5 text-[0.93rem] text-[#6e4a32]">
              {[
                { href: "/", label: "Accueil" },
                { href: "/nos-prestations", label: "Nos prestations" },
                { href: "/mentions-legales", label: "Mentions légales" },
                { href: "/cgv-cgu", label: "CGV / CGU" },
                {
                  href: "/politique-confidentialite",
                  label: "Confidentialité",
                },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center gap-2 hover:text-[#3e2a1f] transition-colors"
                >
                  <span className="text-[#b28a62] text-xs opacity-50 group-hover:opacity-100 transition-opacity">
                    ✦
                  </span>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Column 3 — Contact CTA */}
          <div className="relative pl-4 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-transparent before:via-[#b28a62]/40 before:to-transparent">
            <p className="gazette-label mb-4">Contact</p>
            <p className="text-[0.93rem] leading-7 text-[#6e4a32]">
              Un projet, une question, un audit à venir&nbsp;? Un échange simple
              peut déjà tout changer.
            </p>
            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 border border-[#8a4b24] px-4 py-2 font-['Cinzel'] text-[0.68rem] uppercase tracking-[0.14em] text-[#8a4b24] hover:bg-[#8a4b24] hover:text-[#f7ead6] transition-all duration-300"
            >
              Réserver un appel
              <span className="text-[0.6rem]">→</span>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-[#b28a62]/25 px-6 py-4">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-2 text-[0.72rem] text-[#8a7060]">
          <p className="gazette-byline" style={{ fontSize: "0.62rem" }}>
            © {new Date().getFullYear()} Selen Editions · Tous droits réservés
          </p>
          <div className="gazette-dot-rule" style={{ gap: "0.5rem" }}>
            <span>✦</span>
            <span>✦</span>
            <span>✦</span>
          </div>
          <p className="gazette-byline" style={{ fontSize: "0.62rem" }}>
            Cabinet administratif · Formation continue
          </p>
        </div>
      </div>
    </footer>
  );
}
