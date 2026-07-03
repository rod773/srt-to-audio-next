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
    const ws = new WebSocket(wsUrl);

    const audioData: Buffer[] = [];
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanUp = () => {
      if (timeout) clearTimeout(timeout);
      try { ws.close(); } catch {}
    };

    timeout = setTimeout(() => {
      cleanUp();
      reject(new Error("TTS timed out after 30s"));
    }, 30000);

    ws.onopen = () => {
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
        `<voice name='${voice}'>${escapeXml(text)}</voice></speak>`;
      ws.send(ssml);
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === "string") {
        if (data.includes("turn.end")) {
          cleanUp();
          resolve(Buffer.concat(audioData));
        }
        return;
      }

      if (data instanceof ArrayBuffer) {
        const buf = Buffer.from(data);
        const sep = "Path:audio\r\n";
        const idx = buf.indexOf(sep);
        if (idx !== -1) {
          audioData.push(buf.subarray(idx + sep.length));
        }
      } else if (Array.isArray(data)) {
        for (const chunk of data) {
          const buf = Buffer.from(chunk);
          const sep = "Path:audio\r\n";
          const idx = buf.indexOf(sep);
          if (idx !== -1) {
            audioData.push(buf.subarray(idx + sep.length));
          }
        }
      }
    };

    ws.onerror = (event) => {
      cleanUp();
      reject(new Error(`WebSocket error: ${(event as ErrorEvent).message || "Unknown"}`));
    };

    ws.onclose = () => {
      if (audioData.length > 0) {
        resolve(Buffer.concat(audioData));
      } else {
        reject(new Error("WebSocket closed before audio received"));
      }
    };
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
