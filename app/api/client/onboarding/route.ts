import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Cette route de création NDA est obsolète." },
    { status: 410 },
  );
}
