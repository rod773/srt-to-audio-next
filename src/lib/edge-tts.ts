import WebSocket from "ws";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

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

export async function getVoices(): Promise<Voice[]> {
  const url = `https://${BASE_URL}/voices/list?trustedclienttoken=${TOKEN}`;
  const res = await fetch(url);
  return res.json();
}

export function tts(text: string, voice: string): Promise<Buffer> {
  const wsUrl = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TOKEN}&ConnectionId=${uuid()}`;

  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: {
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44",
      },
    });

    const audioData: Buffer[] = [];
    let resolved = false;

    const done = (err?: Error) => {
      if (resolved) return;
      resolved = true;
      try { ws.close(); } catch {}
      if (err) reject(err);
      else if (audioData.length > 0) resolve(Buffer.concat(audioData));
      else reject(new Error("No audio data received"));
    };

    const timeout = setTimeout(() => done(new Error("TTS timed out")), 30000);

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
      const configMsg =
        `X-Timestamp:${Date()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`;
      ws.send(configMsg);

      const ssml =
        `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${Date()}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</voice></speak>`;
      ws.send(ssml);
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        const buf = data as Buffer;
        const sep = "Path:audio\r\n";
        const idx = buf.indexOf(sep);
        if (idx !== -1) audioData.push(buf.subarray(idx + sep.length));
      } else {
        const msg = data.toString();
        if (msg.includes("turn.end")) {
          clearTimeout(timeout);
          done();
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
