import WebSocket from "ws";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const BASE_URL = "speech.platform.bing.com/consumer/speech/synthesize/readaloud";

export interface Voice {
  Name: string;
  ShortName: string;
  FriendlyName: string;
  Gender: string;
  Locale: string;
  VoiceTag?: {
    ContentCategories?: string[];
    VoicePersonalities?: string[];
  };
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
      host: "speech.platform.bing.com",
      origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.66 Safari/537.36 Edg/103.0.1264.44",
      },
    });

    const audioData: Buffer[] = [];

    ws.on("message", (rawData, isBinary) => {
      if (!isBinary) {
        const msg = rawData.toString("utf8");
        if (msg.includes("turn.end")) {
          resolve(Buffer.concat(audioData));
          ws.close();
        }
        return;
      }

      const data = rawData as Buffer;
      const sep = "Path:audio\r\n";
      const idx = data.indexOf(sep);
      if (idx !== -1) {
        audioData.push(data.subarray(idx + sep.length));
      }
    });

    ws.on("error", reject);

    const speechConfig = JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
          },
        },
      },
    });

    const configMsg =
      `X-Timestamp:${Date()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`;

    ws.on("open", () => {
      ws.send(configMsg, { compress: true }, (err) => {
        if (err) return reject(err);

        const ssml =
          `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${Date()}Z\r\nPath:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${voice}'>${text}</voice></speak>`;

        ws.send(ssml, { compress: true }, (ssmlErr) => {
          if (ssmlErr) reject(ssmlErr);
        });
      });
    });
  });
}
