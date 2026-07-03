"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Play, Download, Eye, EyeOff, ExternalLink, Loader2 } from "lucide-react";

type Engine = "gtts" | "elevenlabs";

export default function Home() {
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<Engine>("gtts");
  const [apiKey, setApiKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [modelId, setModelId] = useState("eleven_flash_v2_5");
  const [gttsLang, setGttsLang] = useState("en");
  const [gttsAccent, setGttsAccent] = useState("co.in");
  const [showApi, setShowApi] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>(["Ready. Select an SRT file and click Start."]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleStart = async () => {
    if (!srtFile) {
      addLog("⚠️ Please select an SRT file first.");
      return;
    }
    if (engine === "elevenlabs" && !apiKey.trim()) {
      addLog("⚠️ Please enter your ElevenLabs API Key.");
      return;
    }

    setRunning(true);
    setDownloadUrl(null);
    setLogs(["Starting conversion..."]);
    abortRef.current = new AbortController();

    const form = new FormData();
    form.append("srt", srtFile);
    form.append("engine", engine);
    form.append("apiKey", apiKey);
    form.append("voiceId", voiceId);
    form.append("modelId", modelId);
    form.append("gttsLang", gttsLang);
    form.append("gttsAccent", gttsAccent);

    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        body: form,
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Conversion failed" }));
        addLog(`❌ ${err.error}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      addLog(`✅ Done! (${(blob.size / 1024 / 1024).toFixed(1)} MB) — Click download below.`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        addLog("⏹️ Cancelled.");
      } else {
        addLog(`❌ ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } finally {
      setRunning(false);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".srt") || file.name.endsWith(".txt"))) {
      setSrtFile(file);
      addLog(`📄 Selected: ${file.name}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">SRT → Audio</h1>
        <p className="text-sm text-zinc-500">Convert subtitles to speech via gTTS or ElevenLabs</p>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Source &amp; Settings</h2>
        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-400">SRT file</label>
          {srtFile ? (
            <div className="flex items-center gap-2 rounded bg-zinc-800 px-3 py-2 text-sm">
              <Upload size={14} />
              <span className="flex-1 truncate">{srtFile.name}</span>
              <button onClick={() => setSrtFile(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                Change
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-400 hover:border-zinc-500"
            >
              <Upload size={16} />
              <span>Drop .srt file or click to browse</span>
              <input
                type="file"
                accept=".srt,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSrtFile(f);
                    addLog(`📄 Selected: ${f.name}`);
                  }
                }}
              />
            </label>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400">Engine</label>
          <div className="flex gap-2">
            <button
              onClick={() => setEngine("gtts")}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                engine === "gtts" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              gTTS (Free)
            </button>
            <button
              onClick={() => setEngine("elevenlabs")}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                engine === "elevenlabs" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              ElevenLabs
            </button>
          </div>
        </div>
      </section>

      {engine === "gtts" && (
        <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Google Text-to-Speech (Free)</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">Language (lang)</label>
              <input
                type="text"
                value={gttsLang}
                onChange={(e) => setGttsLang(e.target.value)}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-sm text-zinc-400">
                Accent / Voice (tld)
                <a
                  href="https://gtts.readthedocs.io/en/latest/module.html#localized-accents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink size={14} />
                </a>
              </label>
              <input
                type="text"
                value={gttsAccent}
                onChange={(e) => setGttsAccent(e.target.value)}
                className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-zinc-600">co.in (male), com (female US), co.uk (female UK)</p>
            </div>
          </div>
        </section>
      )}

      {engine === "elevenlabs" && (
        <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">ElevenLabs (API required)</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-zinc-400">API Key</label>
              <div className="flex items-center gap-2">
                <input
                  type={showApi ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
                />
                <button
                  onClick={() => setShowApi(!showApi)}
                  className="shrink-0 rounded bg-zinc-800 p-2 text-zinc-400 hover:text-zinc-200"
                >
                  {showApi ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Voice ID</label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-zinc-400">Model ID</label>
                <input
                  type="text"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 flex items-center gap-3">
        {running ? (
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 rounded bg-red-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            <Loader2 size={16} className="animate-spin" /> Converting…
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={!srtFile}
            className="flex items-center gap-2 rounded bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
          >
            <Play size={16} /> Start Conversion
          </button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download="output_audio.mp3"
            className="flex items-center gap-2 rounded bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
          >
            <Download size={16} /> Download MP3
          </a>
        )}
      </div>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900">
        <h2 className="border-b border-zinc-800 px-5 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Progress
        </h2>
        <div className="h-64 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>
    </div>
  );
}
