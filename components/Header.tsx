"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-[#b28a62]/50 bg-[#efe1cc]/95 backdrop-blur-md shadow-[0_4px_24px_rgba(62,42,31,0.08)]"
          : "border-b border-[#b28a62]/30 bg-[#efe1cc]/85 backdrop-blur-sm"
      }`}
    >
      {/* Masthead top strip */}
      <div className="border-b border-[#b28a62]/20 px-6 py-1.5">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <p className="gazette-byline">Gazette Selen · Formation & Clarté</p>
          <div className="gazette-dot-rule text-[0.45rem]">
            <span>✦</span>
            <span>✦</span>
            <span>✦</span>
          </div>
          <p className="gazette-byline hidden md:block">
            Depuis 2017 · Paris, France
          </p>
        </div>
      </div>

      {/* Main nav */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <img
              src="/logo-selen-editions.png"
              alt="Selen Editions"
              className="h-11 w-11 rounded-full object-cover ring-2 ring-[#b28a62]/30 group-hover:ring-[#b28a62]/70 transition-all duration-300"
            />
            <span className="absolute -inset-0.5 rounded-full ring-1 ring-[#c9a055]/0 group-hover:ring-[#c9a055]/40 transition-all duration-500" />
          </div>
          <div>
            <span className="block font-['Playfair_Display'] text-xl font-bold tracking-wide text-[#3e2a1f] leading-tight">
              Selen Editions
            </span>
            <span
              className="block gazette-byline leading-none"
              style={{ fontSize: "0.55rem" }}
            >
              Cabinet administratif · Formation
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-7 text-sm font-medium text-[#6e4a32]">
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
            className="relative overflow-hidden border border-[#3e2a1f] bg-[#3e2a1f] px-5 py-2 font-['Cinzel'] text-[0.72rem] uppercase tracking-[0.12em] text-[#f7ead6] transition-all duration-300 hover:bg-[#5a3520] hover:shadow-[0_4px_16px_rgba(62,42,31,0.25)] active:scale-[0.98]"
          >
            Parlons de vos besoins
          </a>
        </nav>
      </div>
    </header>
  );
}
