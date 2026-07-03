import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

const OUTPUT_DIR = path.join(process.cwd(), "output");

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("file") || "output_audio.mp3";
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="output_audio.mp3"`,
      "Content-Length": stat.size.toString(),
    },
  });
}
