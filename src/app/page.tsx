"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Play, Download, Loader2 } from "lucide-react";

interface Voice {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: string;
  Locale: string;
}

function msToSrt(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  const millis = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${millis}`;
}

export default function Home() {
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [edgeVoice, setEdgeVoice] = useState("");
  const [localeFilter, setLocaleFilter] = useState("all");
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

  useEffect(() => {
    fetch("/api/voices")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setVoices(data);
const en = data.find((v: Voice) => v.ShortName === "en-US-GuyNeural");
if (en) setEdgeVoice(en.ShortName);
        }
      })
      .catch(() => {});
  }, []);

  const locales = [...new Set(voices.map((v) => v.Locale))].sort();
  const filteredVoices = localeFilter === "all" ? voices : voices.filter((v) => v.Locale === localeFilter);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleStart = async () => {
    if (!srtFile) {
      addLog("⚠️ Please select an SRT file first.");
      return;
    }

    setRunning(true);
    setDownloadUrl(null);
    setLogs(["Starting conversion..."]);
    abortRef.current = new AbortController();

    const form = new FormData();
    form.append("srt", srtFile);
    form.append("edgeVoice", edgeVoice);

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

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === "progress") {
              const short = data.text.length > 60 ? data.text.slice(0, 60) + "…" : data.text;
              const time = `${msToSrt(data.startMs)} → ${msToSrt(data.endMs)}`;
              addLog(`🎤 [${data.segment}/${data.total}] ${time} ${short}`);
            } else if (data.type === "done") {
              const binaryStr = atob(data.audio);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const blob = new Blob([bytes], { type: "audio/mpeg" });
              const url = URL.createObjectURL(blob);
              setDownloadUrl(url);
              addLog(`✅ Done! (${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
            } else if (data.type === "error") {
              addLog(`❌ ${data.message}`);
            }
          } catch {}
        }
      }
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
        <p className="text-sm text-zinc-500">Convert subtitles to speech via Microsoft Edge TTS</p>
      </header>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
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

        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-400">Locale</label>
          <select
            value={localeFilter}
            onChange={(e) => setLocaleFilter(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
          >
            <option value="all">All locales</option>
            {locales.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-400">Voice</label>
          <select
            value={edgeVoice}
            onChange={(e) => setEdgeVoice(e.target.value)}
            className="w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
          >
            {filteredVoices.length === 0 && <option value="">Loading voices…</option>}
            {filteredVoices.map((v) => (
              <option key={v.ShortName} value={v.ShortName}>
                {v.FriendlyName} ({v.Gender}) — {v.Locale}
              </option>
            ))}
          </select>
        </div>
      </section>

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
