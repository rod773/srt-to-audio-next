import WebSocket from "ws";
import * as crypto from "crypto";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const CHROMIUM_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR = "143";

export interface Voice {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: string;
  Locale: string;
}

function uuid(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function generateSecMsGec(): string {
  const WIN_EPOCH = 11644473600;
  const now = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  const rounded = now - (now % 300);
  const ticks = rounded * 1e7;
  return crypto.createHash("sha256").update(`${ticks}${TOKEN}`).digest("hex").toUpperCase();
}

export async function getVoices(): Promise<Voice[]> {
  const url = `https://${BASE_URL}/voices/list?trustedclienttoken=${TOKEN}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
    },
  });
  return res.json();
}

export function mp3DurationMs(buf: Buffer): number {
  return Math.floor((buf.length / 6000) * 1000);
}

export async function tts(text: string, voice: string, speed?: number, retries = 3): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await ttsOnce(text, voice, speed);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error("tts failed");
}

function ttsOnce(text: string, voice: string, speed?: number): Promise<Buffer> {
  const secMsGec = generateSecMsGec();
  const connId = uuid();
  const wsUrl =
    `wss://${BASE_URL}/edge/v1?` +
    `TrustedClientToken=${TOKEN}` +
    `&ConnectionId=${connId}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`;

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent":
          `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` +
          ` (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const audioData: Buffer[] = [];
    let resolved = false;
    const debug: string[] = [];

    const done = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch {}
      if (err) reject(new Error(`${err.message}\n${debug.join("\n")}`));
      else if (audioData.length > 0) resolve(Buffer.concat(audioData));
      else reject(new Error(`No audio data received\n${debug.join("\n")}`));
    };

    const timeout = setTimeout(() => done(new Error("TTS timed out")), 60000);

    ws.on("open", () => {
      debug.push("WebSocket opened");

      const config = {
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
              outputFormat: "audio-24khz-48kbitrate-mono-mp3",
            },
          },
        },
      };
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `${JSON.stringify(config)}\r\n`
      );
      debug.push("Config sent");

      const clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
      const escaped = clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const rateAttr = speed ? ` rate="${speed.toFixed(2)}x"` : "";
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'><prosody${rateAttr}>${escaped}</prosody></voice></speak>`;

      const ssmlMsg =
        `X-RequestId:${uuid()}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toString()}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
      debug.push(`SSML sent (${voice})`);
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (data.length < 2) return;
        const hdrLen = data.readUInt16BE(0);
        if (hdrLen + 2 > data.length) return;
        const hdrStr = data.subarray(2, hdrLen + 2).toString();
        if (hdrStr.includes("Content-Type:audio")) {
          const payload = data.subarray(hdrLen + 2);
          if (payload.length > 0) {
            audioData.push(payload);
          }
        }
      } else {
        const msg = data.toString();
        const pathMatch = msg.match(/Path:(\S+)/);
        const path = pathMatch ? pathMatch[1] : "?";
        debug.push(`Text msg path=${path} (${msg.slice(0, 80)}...)`);
        if (msg.includes("turn.end")) {
          clearTimeout(timeout);
          done();
        }
      }
    });

    ws.on("error", (err: Error) => {
      clearTimeout(timeout);
      done(new Error(`WebSocket error: ${err.message}`));
    });

    ws.on("close", (code?: number, reason?: Buffer) => {
      clearTimeout(timeout);
      debug.push(`Close code=${code} reason=${reason ? reason.toString() : "none"}`);
      done();
    });
  });
}