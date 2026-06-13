import { NextResponse } from "next/server";
import {
  getAdminSupabase,
  listClientNdaDossiers,
} from "@/lib/server/clientNdaAccess";

export async function GET() {
  try {
    const supabase = getAdminSupabase();
    const result = await listClientNdaDossiers(supabase);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ dossiers: result.dossiers });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
