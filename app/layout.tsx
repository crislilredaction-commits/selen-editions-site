import "./globals.css";
import type { Metadata } from "next";
import { Playfair_Display, EB_Garamond, Cinzel } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
});

export const metadata: Metadata = {
  title: "Selen Editions",
  description:
    "Petite équipe française spécialisée dans la gestion administrative des organismes de formation et la certification Qualiopi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${playfair.variable} ${ebGaramond.variable} ${cinzel.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
