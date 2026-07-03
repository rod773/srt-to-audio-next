import { NextResponse } from "next/server";

export async function GET() {
  const { default: WebSocket } = await import("ws");
  const logs: string[] = [];

  try {
    const ws = new WebSocket("wss://echo.websocket.org");
    logs.push("constructed");

    await Promise.race([
      new Promise<void>((resolve) => {
        ws.on("open", () => {
          logs.push("open");
          ws.send("hello", (err: any) => {
            logs.push(`send cb err=${err}`);
            ws.close();
            resolve();
          });
        });
      }),
      new Promise<void>((resolve) => setTimeout(() => { logs.push("timeout"); resolve(); }, 5000)),
    ]);

    try { ws.close(); } catch {}
  } catch (err: any) {
    logs.push(`error: ${err.message}`);
  }

  return NextResponse.json({ logs });
}
