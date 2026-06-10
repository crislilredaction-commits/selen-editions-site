import { redirect } from "next/navigation";

const STUDIO_URL =
  process.env.NEXT_PUBLIC_STUDIO_URL || "https://studio.selen-editions.fr/";

export default function AgentLoginRedirectPage() {
  redirect(STUDIO_URL);
}
