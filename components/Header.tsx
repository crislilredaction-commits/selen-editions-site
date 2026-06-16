"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STUDIO_URL =
  process.env.NEXT_PUBLIC_STUDIO_URL || "https://studio.selen-editions.fr/";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (menuOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "border-b border-[#b28a62]/50 bg-[#efe1cc]/95 backdrop-blur-md shadow-[0_4px_22px_rgba(62,42,31,0.08)]"
            : "border-b border-[#b28a62]/35 bg-[#efe1cc]/90 backdrop-blur-sm"
        }`}
      >
        <div className="hidden border-b border-[#b28a62]/25 px-6 py-0.5 md:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <p className="gazette-byline opacity-75" style={{ fontSize: "0.52rem" }}>
              Gazette Selen · Formation & Clarté
            </p>

            <div className="gazette-dot-rule text-[0.38rem] opacity-50">
              <span>✦</span>
              <span>✦</span>
              <span>✦</span>
            </div>

            <p className="gazette-byline opacity-75" style={{ fontSize: "0.52rem" }}>
              Depuis 2017 · France
            </p>
          </div>
        </div>

        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-3 px-4 py-2 md:grid-cols-[1fr_auto_1fr] md:px-6 md:py-2.5">
          <Link
            href="/"
            className="group flex min-w-0 items-center gap-2.5"
            onClick={() => setMenuOpen(false)}
          >
            <img
              src="/logo-selen-editions.png"
              alt="Selen Editions"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#b28a62]/35 transition-all duration-300 group-hover:ring-[#b28a62]/70 md:h-12 md:w-12"
            />

            <div className="min-w-0">
              <span className="block font-['Playfair_Display'] text-lg font-bold leading-none tracking-wide text-[#3e2a1f] md:text-[1.35rem]">
                Selen Editions
              </span>
              <span
                className="gazette-byline mt-1 hidden leading-none md:block"
                style={{ fontSize: "0.5rem" }}
              >
                Cabinet administratif · Formation
              </span>
            </div>
          </Link>

          <nav className="hidden items-center justify-center gap-5 text-sm font-medium text-[#6e4a32] md:flex">
            {[
              { href: "/", label: "Accueil" },
              { href: "/nos-prestations", label: "Prestations" },
              { href: "/articles", label: "Articles" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="group relative whitespace-nowrap font-['EB_Garamond'] text-[0.98rem] transition-colors hover:text-[#3e2a1f]"
              >
                {label}
                <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#b28a62] transition-all duration-300 group-hover:w-full" />
              </Link>
            ))}
          </nav>

          <div className="hidden items-center justify-end gap-2 md:flex">
            <Link
              href="/client/login"
              className="border border-[#b28a62]/70 bg-[#f7ead6]/45 px-3 py-1.5 font-['Cinzel'] text-[0.6rem] uppercase tracking-[0.1em] text-[#3e2a1f] transition-all duration-300 hover:bg-[#ead4b3]"
            >
              Espace client
            </Link>

            <a
              href={STUDIO_URL}
              className="border border-[#b28a62]/60 bg-transparent px-3 py-1.5 font-['Cinzel'] text-[0.6rem] uppercase tracking-[0.1em] text-[#3e2a1f] transition-all duration-300 hover:bg-[#ead4b3]"
            >
              Espace agent
            </a>

            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              className="border border-[#3e2a1f] bg-[#3e2a1f] px-4 py-1.5 font-['Cinzel'] text-[0.62rem] uppercase tracking-[0.11em] text-[#f7ead6] transition-all duration-300 hover:bg-[#5a3520]"
            >
              Parlons de vos besoins
            </a>
          </div>

          <button
            className="flex h-9 w-9 flex-col items-center justify-center gap-[5px] justify-self-end border border-[#b28a62]/40 bg-[#f4e8d6]/60 transition-all duration-200 active:scale-95 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span
              className={`block h-[1.5px] w-5 origin-center bg-[#3e2a1f] transition-all duration-300 ${
                menuOpen ? "translate-y-[6.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-[#3e2a1f] transition-all duration-300 ${
                menuOpen ? "scale-x-0 opacity-0" : ""
              }`}
            />
            <span
              className={`block h-[1.5px] w-5 origin-center bg-[#3e2a1f] transition-all duration-300 ${
                menuOpen ? "-translate-y-[6.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </header>

      <div
        className={`fixed inset-0 z-40 transition-all duration-300 md:hidden ${
          menuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-[#3e2a1f]/40 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />

        <nav
          className={`absolute right-0 top-0 h-full w-[78vw] max-w-[320px] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            menuOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{
            background: "linear-gradient(160deg, #f4ead2 0%, #ede0c4 100%)",
            borderLeft: "1px solid rgba(178,138,98,0.4)",
            boxShadow: "-20px 0 60px rgba(62,42,31,0.15)",
          }}
        >
          <div className="flex items-center justify-between border-b border-[#b28a62]/30 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo-selen-editions.png"
                alt="Selen Editions"
                className="h-9 w-9 rounded-full object-cover ring-2 ring-[#b28a62]/30"
              />
              <span className="font-['Playfair_Display'] text-lg font-bold text-[#3e2a1f]">
                Selen Editions
              </span>
            </div>

            <button
              onClick={() => setMenuOpen(false)}
              className="flex h-8 w-8 items-center justify-center text-lg text-[#6e4a32]"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-1 px-6 pt-6">
            <p className="gazette-byline mb-3" style={{ fontSize: "0.58rem" }}>
              Navigation
            </p>

            {[
              { href: "/", label: "Accueil" },
              { href: "/nos-prestations", label: "Prestations" },
              { href: "/articles", label: "Articles" },
              { href: "/client/login", label: "Espace client" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 border-b border-[#b28a62]/15 py-3.5 font-['EB_Garamond'] text-xl text-[#3e2a1f] transition-colors hover:text-[#8a4b24]"
              >
                <span className="text-xs text-[#b28a62] opacity-60">✦</span>
                {label}
              </Link>
            ))}

            <a
              href={STUDIO_URL}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 border-b border-[#b28a62]/15 py-3.5 font-['EB_Garamond'] text-xl text-[#3e2a1f] transition-colors hover:text-[#8a4b24]"
            >
              <span className="text-xs text-[#b28a62] opacity-60">✦</span>
              Espace agent
            </a>

            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="mt-7 flex items-center justify-center border border-[#3e2a1f] bg-[#3e2a1f] px-5 py-3 font-['Cinzel'] text-[0.68rem] uppercase tracking-[0.13em] text-[#f7ead6]"
            >
              Parlons de vos besoins
            </a>

            <div className="mt-10">
              <div className="gazette-dot-rule opacity-40">
                <span>✦</span>
                <span>✦</span>
                <span>✦</span>
              </div>
              <p
                className="gazette-byline mt-3 text-center"
                style={{ fontSize: "0.55rem" }}
              >
                Depuis 2017 · France
              </p>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}
