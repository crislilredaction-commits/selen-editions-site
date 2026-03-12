"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

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
            ? "border-b border-[#b28a62]/50 bg-[#efe1cc]/95 backdrop-blur-md shadow-[0_4px_24px_rgba(62,42,31,0.08)]"
            : "border-b border-[#b28a62]/30 bg-[#efe1cc]/85 backdrop-blur-sm"
        }`}
      >
        {/* Masthead top strip — masqué sur mobile */}
        <div className="hidden md:block border-b border-[#b28a62]/20 px-6 py-1.5">
          <div className="mx-auto max-w-6xl flex items-center justify-between">
            <p className="gazette-byline">Gazette Selen · Formation & Clarté</p>
            <div className="gazette-dot-rule text-[0.45rem]">
              <span>✦</span>
              <span>✦</span>
              <span>✦</span>
            </div>
            <p className="gazette-byline">Depuis 2017 · Paris, France</p>
          </div>
        </div>

        {/* Main nav */}
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            onClick={() => setMenuOpen(false)}
          >
            <img
              src="/logo-selen-editions.png"
              alt="Selen Editions"
              className="h-9 w-9 md:h-11 md:w-11 rounded-full object-cover ring-2 ring-[#b28a62]/30 group-hover:ring-[#b28a62]/70 transition-all duration-300"
            />
            <div>
              <span className="block font-['Playfair_Display'] text-lg md:text-xl font-bold tracking-wide text-[#3e2a1f] leading-tight">
                Selen Editions
              </span>
              <span
                className="hidden md:block gazette-byline leading-none"
                style={{ fontSize: "0.55rem" }}
              >
                Cabinet administratif · Formation
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#6e4a32]">
            <Link
              href="/"
              className="relative group font-['EB_Garamond'] text-base hover:text-[#3e2a1f] transition-colors"
            >
              Accueil
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#b28a62] group-hover:w-full transition-all duration-300" />
            </Link>
            <Link
              href="/nos-prestations"
              className="relative group font-['EB_Garamond'] text-base hover:text-[#3e2a1f] transition-colors"
            >
              Nos prestations
              <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#b28a62] group-hover:w-full transition-all duration-300" />
            </Link>
            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              className="border border-[#3e2a1f] bg-[#3e2a1f] px-5 py-2 font-['Cinzel'] text-[0.72rem] uppercase tracking-[0.12em] text-[#f7ead6] transition-all duration-300 hover:bg-[#5a3520]"
            >
              Parlons de vos besoins
            </a>
          </nav>

          {/* Burger mobile */}
          <button
            className="md:hidden flex flex-col justify-center items-center gap-[5px] w-10 h-10 border border-[#b28a62]/40 bg-[#f4e8d6]/60 transition-all duration-200 active:scale-95"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span
              className={`block h-[1.5px] w-5 bg-[#3e2a1f] transition-all duration-300 origin-center ${menuOpen ? "rotate-45 translate-y-[6.5px]" : ""}`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-[#3e2a1f] transition-all duration-300 ${menuOpen ? "opacity-0 scale-x-0" : ""}`}
            />
            <span
              className={`block h-[1.5px] w-5 bg-[#3e2a1f] transition-all duration-300 origin-center ${menuOpen ? "-rotate-45 -translate-y-[6.5px]" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 z-40 transition-all duration-300 md:hidden ${menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className="absolute inset-0 bg-[#3e2a1f]/40 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
        <nav
          className={`absolute top-0 right-0 h-full w-[78vw] max-w-[320px] transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
          style={{
            background: "linear-gradient(160deg, #f4ead2 0%, #ede0c4 100%)",
            borderLeft: "1px solid rgba(178,138,98,0.4)",
            boxShadow: "-20px 0 60px rgba(62,42,31,0.15)",
          }}
        >
          <div className="flex items-center justify-between border-b border-[#b28a62]/30 px-6 py-4">
            <span className="font-['Playfair_Display'] text-lg font-bold text-[#3e2a1f]">
              Selen Editions ✨
            </span>
            <button
              onClick={() => setMenuOpen(false)}
              className="w-8 h-8 flex items-center justify-center text-[#6e4a32] text-lg"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col px-6 pt-8 gap-1">
            <p className="gazette-byline mb-4" style={{ fontSize: "0.58rem" }}>
              Navigation
            </p>
            {[
              { href: "/", label: "Accueil" },
              { href: "/nos-prestations", label: "Nos prestations" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 border-b border-[#b28a62]/15 py-4 font-['EB_Garamond'] text-xl text-[#3e2a1f] hover:text-[#8a4b24] transition-colors"
              >
                <span className="text-[#b28a62] text-xs opacity-60">✦</span>
                {label}
              </Link>
            ))}
            <a
              href="https://calendly.com/romaric-paymal/rdv-romaric-paymal"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
              className="mt-8 flex items-center justify-center border border-[#3e2a1f] bg-[#3e2a1f] px-6 py-4 font-['Cinzel'] text-[0.72rem] uppercase tracking-[0.14em] text-[#f7ead6]"
            >
              Parlons de vos besoins
            </a>
            <div className="mt-12">
              <div className="gazette-dot-rule opacity-40">
                <span>✦</span>
                <span>✦</span>
                <span>✦</span>
              </div>
              <p
                className="gazette-byline mt-3 text-center"
                style={{ fontSize: "0.55rem" }}
              >
                Depuis 2017 · Paris, France
              </p>
            </div>
          </div>
        </nav>
      </div>
    </>
  );
}
