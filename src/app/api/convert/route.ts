import { NextRequest, NextResponse } from "next/server";
import * as gtts from "google-tts-api";

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

async function fetchGttsAudio(
  text: string,
  lang: string,
  host: string
): Promise<Buffer> {
  const parts = await gtts.getAllAudioUrls(text, { lang, host, slow: false });
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const res = await fetch(part.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`gTTS HTTP ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}

async function fetchElevenlabsAudio(
  text: string,
  apiKey: string,
  voiceId: string,
  modelId: string
): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API Error: ${res.status} ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const srtFile = form.get("srt") as File;
    const engine = form.get("engine") as string;
    const apiKey = (form.get("apiKey") as string) || "";
    const voiceId = (form.get("voiceId") as string) || "";
    const modelId = (form.get("modelId") as string) || "eleven_flash_v2_5";
    const gttsLang = (form.get("gttsLang") as string) || "en";
    const gttsAccent = (form.get("gttsAccent") as string) || "";

    if (!srtFile) {
      return NextResponse.json({ error: "No SRT file provided" }, { status: 400 });
    }
    if (engine === "elevenlabs" && !apiKey) {
      return NextResponse.json({ error: "ElevenLabs API key required" }, { status: 400 });
    }

    const srtText = await srtFile.text();
    const segments = parseSrt(srtText);
    if (segments.length === 0) {
      return NextResponse.json({ error: "No valid subtitles found" }, { status: 400 });
    }

    const gttsHost = gttsAccent
      ? `translate.google.${gttsAccent}`
      : "translate.google.com";

    const audioParts: Buffer[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let buf: Buffer;

      if (engine === "gtts") {
        buf = await fetchGttsAudio(seg.text, gttsLang, gttsHost);
      } else {
        buf = await fetchElevenlabsAudio(seg.text, apiKey, voiceId, modelId);
      }

      if (seg.startMs > audioParts.reduce((a, b) => a + b.length, 0)) {
        const silenceMs = seg.startMs - audioParts.reduce((a, b) => a + b.length, 0);
        audioParts.push(Buffer.alloc(Math.round(silenceMs * 1.6)));
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
