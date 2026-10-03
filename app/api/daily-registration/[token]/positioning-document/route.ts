import { NextResponse } from "next/server";
import { resolveRegistrationPositioning } from "@/lib/server/dailyRegistrationPositioning";
import { downloadPositioning, OwnPositioningError } from "@/lib/server/dailyOwnPositioning";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token.trim()) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const { admin, original } = await resolveRegistrationPositioning(token.trim());
    return await downloadPositioning(admin, original);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof OwnPositioningError ? cause.message : "Téléchargement indisponible." }, { status: cause instanceof OwnPositioningError ? cause.status : 500 });
  }
}
