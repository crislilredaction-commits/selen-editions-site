import { NextResponse } from "next/server";

const RETIRED_RESPONSE = {
  error: "Cette integration Calendly a ete retiree. Utilisez la prise de rendez-vous Selen.",
};

function gone() {
  return NextResponse.json(RETIRED_RESPONSE, { status: 410 });
}

export async function POST() {
  return gone();
}

export async function GET() {
  return gone();
}
