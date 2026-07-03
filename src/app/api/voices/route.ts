import { NextResponse } from "next/server";
import { getVoices } from "@/lib/edge-tts";

export async function GET() {
  try {
    const voices = await getVoices();
    return NextResponse.json(voices);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
