import { NextRequest, NextResponse } from "next/server";
import { tts } from "@/lib/edge-tts";

interface SrtSegment {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

function parseSrt(content: string): SrtSegment[] {
  const segments: SrtSegment[] = [];
  const blocks = content.trim().replace(/\r\n/g, "\n").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const index = parseInt(lines[0], 10);
    const m = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!m) continue;
    const toMs = (h: number, mi: number, s: number, ms: number) =>
      h * 3600000 + mi * 60000 + s * 1000 + ms;
    const startMs = toMs(+m[1], +m[2], +m[3], +m[4]);
    const endMs = toMs(+m[5], +m[6], +m[7], +m[8]);
    const text = lines.slice(2).join(" ").trim();
    if (text) segments.push({ index, startMs, endMs, text });
  }
  return segments;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const srtFile = form.get("srt") as File;
    const edgeVoice = (form.get("edgeVoice") as string) || "en-US-AriaNeural";

    if (!srtFile) {
      return NextResponse.json({ error: "No SRT file provided" }, { status: 400 });
    }

    const srtText = await srtFile.text();
    const segments = parseSrt(srtText);
    if (segments.length === 0) {
      return NextResponse.json({ error: "No valid subtitles found" }, { status: 400 });
    }

    const audioParts: Buffer[] = [];
    for (const seg of segments) {
      const buf = await tts(seg.text, edgeVoice);
      const currentLen = audioParts.reduce((a, b) => a + b.length, 0);
      if (seg.startMs > currentLen) {
        audioParts.push(Buffer.alloc(seg.startMs - currentLen));
      }
      audioParts.push(buf);
    }

    const finalBuffer = Buffer.concat(audioParts);

    return new NextResponse(finalBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'attachment; filename="output_audio.mp3"',
        "Content-Length": finalBuffer.length.toString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
