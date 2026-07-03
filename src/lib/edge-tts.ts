import WebSocket from "ws";
import crypto from "crypto";

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

function uuid() {
  return crypto.randomUUID().replaceAll("-", "");
}

function generateSecMsGec(): string {
  const WIN_EPOCH = 11644473600;
  const now = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  const rounded = now - (now % 300);
  const ticks = rounded * 1e7;
  const hash = crypto.createHash("sha256").update(`${ticks}${TOKEN}`).digest("hex");
  return hash.toUpperCase();
}

function generateMuid(): string {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
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

export function tts(text: string, voice: string): Promise<Buffer> {
  const secMsGec = generateSecMsGec();
  const muid = generateMuid();
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
        "Cookie": `muid=${muid};`,
      },
    });

    const audioData: Buffer[] = [];
    let resolved = false;
    let lastResponse = "";

    const done = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch {}
      if (err) reject(err);
      else if (audioData.length > 0) resolve(Buffer.concat(audioData));
      else reject(new Error(lastResponse ? `TTS error: ${lastResponse.slice(0, 200)}` : "No audio data received"));
    };

    const timeout = setTimeout(() => done(new Error("TTS timed out")), 60000);

    ws.on("open", () => {
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
        `X-Timestamp:${new Date().toString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `${JSON.stringify(config)}\r\n`
      );

      const clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
      const escaped = clean.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      const ssml =
        `X-RequestId:${uuid()}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toString()}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>` +
        `${escaped}</prosody></voice></speak>`;
      ws.send(ssml);
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        if (headerLen + 2 > buf.length) return;
        const headerStr = buf.subarray(2, headerLen + 2).toString();
        const payload = buf.subarray(headerLen + 2);
        if (headerStr.includes("Path:audio\r\n") && payload.length > 0) {
          audioData.push(payload);
        }
      } else {
        const msg = data.toString();
        if (msg.includes("turn.end")) {
          clearTimeout(timeout);
          done();
        } else if (msg.includes("Path:response")) {
          lastResponse = msg;
        }
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      done(new Error(`WebSocket error: ${err.message}`));
    });

    ws.on("close", () => {
      clearTimeout(timeout);
      done();
    });
  });
}
