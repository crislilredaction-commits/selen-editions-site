import "./globals.css";
import { Playfair_Display, EB_Garamond, Cinzel } from "next/font/google";
import AgentAssistanceBanner from "@/components/AgentAssistanceBanner";

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

export const metadata = {
  title: "Selen Editions",
  description: "Le grimoire administratif des formateurs",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        suppressHydrationWarning
        className={`${playfair.variable} ${ebGaramond.variable} ${cinzel.variable}`}
      >
        <AgentAssistanceBanner />
        {children}
      </body>
    </html>
  );
}
