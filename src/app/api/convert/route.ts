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

function batchSegments(segs: SrtSegment[]): SrtSegment[][] {
  const batches: SrtSegment[][] = [];
  let batch: SrtSegment[] = [];
  let totalLen = 0;
  for (const s of segs) {
    if (batch.length > 0 && (batch.length >= 5 || totalLen + s.text.length > 300)) {
      batches.push(batch);
      batch = [];
      totalLen = 0;
    }
    batch.push(s);
    totalLen += s.text.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
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

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const batches = batchSegments(segments);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const audioParts: Buffer[] = [];
        try {
          for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];

            for (const seg of batch) {
              const progress = JSON.stringify({
                type: "progress",
                segment: seg.index,
                total: segments.length,
                startMs: seg.startMs,
                endMs: seg.endMs,
                text: seg.text,
              }) + "\n";
              controller.enqueue(encoder.encode(progress));
            }

            const mergedText = batch.map((s) => s.text).join(" ");
            const buf = await tts(mergedText, edgeVoice);
            const firstSeg = batch[0];
            const currentLen = audioParts.reduce((a, b) => a + b.length, 0);
            if (firstSeg.startMs > currentLen) {
              audioParts.push(Buffer.alloc(firstSeg.startMs - currentLen));
            }
            audioParts.push(buf);

            if (b < batches.length - 1) {
              await sleep(100);
            }
          }

          const finalBuffer = Buffer.concat(audioParts);
          const doneMsg = JSON.stringify({
            type: "done",
            audio: finalBuffer.toString("base64"),
          }) + "\n";
          controller.enqueue(encoder.encode(doneMsg));
          controller.close();
        } catch (err) {
          const errMsg = JSON.stringify({
            type: "error",
            message: err instanceof Error ? err.message : "Unknown error",
          }) + "\n";
          controller.enqueue(encoder.encode(errMsg));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
