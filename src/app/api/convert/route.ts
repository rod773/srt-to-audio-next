import { NextRequest, NextResponse } from "next/server";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

let activeProcess: ChildProcess | null = null;

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "output");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const srtFile = form.get("srt") as File;
    const engine = form.get("engine") as string;
    const maxSpeed = parseFloat((form.get("maxSpeed") as string) || "1.5");
    const apiKey = (form.get("apiKey") as string) || "";
    const voiceId = (form.get("voiceId") as string) || "";
    const modelId = (form.get("modelId") as string) || "eleven_flash_v2_5";
    const gttsLang = (form.get("gttsLang") as string) || "en";
    const gttsAccent = (form.get("gttsAccent") as string) || "";

    if (!srtFile) {
      return NextResponse.json({ error: "No SRT file provided" }, { status: 400 });
    }

    ensureDir(UPLOAD_DIR);
    ensureDir(OUTPUT_DIR);

    const ext = srtFile.name.endsWith(".srt") ? ".srt" : ".txt";
    const srtPath = path.join(UPLOAD_DIR, `input_${Date.now()}${ext}`);
    const buffer = Buffer.from(await srtFile.arrayBuffer());
    fs.writeFileSync(srtPath, buffer);

    const outputFile = path.join(OUTPUT_DIR, `output_${Date.now()}.mp3`);

    const params = {
      engine,
      srt_path: srtPath,
      max_speed: maxSpeed,
      output_dir: OUTPUT_DIR,
      api_key: apiKey,
      voice_id: voiceId,
      model_id: modelId,
      gtts_lang: gttsLang,
      gtts_accent: gttsAccent,
    };

    resetProgress();

    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const workerPath = path.join(process.cwd(), "convert_worker.py");

    const proc = spawn(pythonCmd, [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    activeProcess = proc;

    proc.stdin.write(JSON.stringify(params));
    proc.stdin.end();

    let stdout = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.current !== undefined) {
            updateProgress(parsed);
          }
          if (parsed.done) {
            updateProgress({ done: true, output: parsed.output });
          }
          if (parsed.error) {
            updateProgress({ error: parsed.error });
          }
        } catch {
          // skip non-json lines
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("Python stderr:", data.toString());
    });

    return new Promise<Response>((resolve) => {
      proc.on("close", (code) => {
        activeProcess = null;
        if (code !== 0) {
          const progress = getProgress();
          resolve(
            NextResponse.json(
              { error: progress.error || "Conversion failed", partial: progress },
              { status: 500 }
            )
          );
        } else {
          const outputName = fs.readdirSync(OUTPUT_DIR).find((f) => f.startsWith("output_") && f.endsWith(".mp3"));
          resolve(
            NextResponse.json({
              success: true,
              output: outputName || "output_audio.mp3",
              progress: getProgress(),
            })
          );
        }
        // Cleanup uploaded srt
        try { fs.unlinkSync(srtPath); } catch {}
      });
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json(getProgress());
}

export async function DELETE() {
  if (activeProcess) {
    activeProcess.kill();
    activeProcess = null;
  }
  resetProgress();
  return NextResponse.json({ cancelled: true });
}

interface ProgressState {
  current: number;
  total: number;
  start: string;
  end: string;
  text: string;
  speed: number;
  done: boolean;
  error: string;
  output: string;
}

let progressState: Partial<ProgressState> = {
  current: 0,
  total: 0,
  start: "",
  end: "",
  text: "",
  speed: 0,
  done: false,
  error: "",
  output: "",
};

function resetProgress() {
  progressState = { current: 0, total: 0, start: "", end: "", text: "", speed: 0, done: false, error: "", output: "" };
}

function updateProgress(data: Partial<ProgressState>) {
  progressState = { ...progressState, ...data };
}

function getProgress() {
  return progressState;
}
