import Link from "next/link";

export default function Footer() {
  return (
    <footer className="gazette-footer">
      <div className="border-b border-[#b28a62]/30 px-4 md:px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <div className="gazette-masthead-rule justify-center">
            <span className="font-['Cinzel'] text-[0.55rem] uppercase tracking-[0.4em] text-[#8a6243] text-center">
              Selen Editions · Gazette officielle
            </span>
          </div>
        </div>
      </div>

      {/* Colonnes — stack sur mobile, 3 cols sur md */}
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 md:py-10">
        <div className="grid gap-8 md:grid-cols-3 md:gap-6">
          <div className="relative md:pl-4 md:before:absolute md:before:left-0 md:before:top-2 md:before:bottom-2 md:before:w-px md:before:bg-gradient-to-b md:before:from-transparent md:before:via-[#b28a62]/40 md:before:to-transparent">
            <p className="gazette-label mb-3">À propos</p>
            <p className="font-['Playfair_Display'] text-xl font-semibold text-[#3e2a1f] leading-snug">
              Selen Editions ✨
            </p>
            <p className="mt-3 text-[0.9rem] leading-7 text-[#6e4a32]">
              Petite équipe française spécialisée dans la gestion administrative
              des organismes de formation et la certification Qualiopi.
            </p>
            <p className="mt-2 gazette-byline">Ensemble depuis 2017</p>
          </div>

          <div className="relative md:pl-4 md:before:absolute md:before:left-0 md:before:top-2 md:before:bottom-2 md:before:w-px md:before:bg-gradient-to-b md:before:from-transparent md:before:via-[#b28a62]/40 md:before:to-transparent">
            <p className="gazette-label mb-3">Rubriques</p>
            <nav className="flex flex-col gap-2 text-[0.9rem] text-[#6e4a32]">
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
                  className="group flex items-center gap-2 hover:text-[#3e2a1f] transition-colors py-1"
                >
                  <span className="text-[#b28a62] text-xs opacity-50 group-hover:opacity-100 transition-opacity">
                    ✦
                  </span>
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="relative md:pl-4 md:before:absolute md:before:left-0 md:before:top-2 md:before:bottom-2 md:before:w-px md:before:bg-gradient-to-b md:before:from-transparent md:before:via-[#b28a62]/40 md:before:to-transparent">
            <p className="gazette-label mb-3">Contact</p>
            <p className="text-[0.9rem] leading-7 text-[#6e4a32]">
              Un projet, une question, un audit à venir ? Un échange simple peut
              déjà tout changer.
            </p>
            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-2 border border-[#8a4b24] px-4 py-2.5 font-['Cinzel'] text-[0.65rem] uppercase tracking-[0.12em] text-[#8a4b24] hover:bg-[#8a4b24] hover:text-[#f7ead6] transition-all duration-300 w-full sm:w-auto justify-center md:justify-start"
            >
              Réserver un appel <span className="text-[0.6rem]">→</span>
            </a>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-[#b28a62]/25 px-4 md:px-6 py-4">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-2 text-center md:text-left">
          <p className="gazette-byline" style={{ fontSize: "0.6rem" }}>
            © {new Date().getFullYear()} Selen Editions · Tous droits réservés
          </p>
          <div
            className="gazette-dot-rule hidden md:flex"
            style={{ gap: "0.5rem" }}
          >
            <span>✦</span>
            <span>✦</span>
            <span>✦</span>
          </div>
          <p className="gazette-byline" style={{ fontSize: "0.6rem" }}>
            Cabinet administratif · Formation continue
          </p>
        </div>
      </div>
    </footer>
  );
}
