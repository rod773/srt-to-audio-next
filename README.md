# SRT → Audio Converter

Convert subtitle (.srt) files to spoken audio using **gTTS** (free) or **ElevenLabs** API.

Next.js web app — deployable to Vercel. No Python required.

## Prerequisites

- **Node.js** 18+

## Setup

```bash
npm install
```

## Usage

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Drag or select an `.srt` file
2. Choose engine: **gTTS** (free) or **ElevenLabs** (API key required)
3. Adjust language / accent / voice settings
4. Click **Start Conversion**
5. Download the resulting MP3

## Engines

| Engine | Cost | Notes |
|--------|------|-------|
| gTTS | Free | Google Text-to-Speech, accent via TLD |
| ElevenLabs | API credits | Requires API key, voice ID, model ID |

## Deploy to Vercel

```bash
npx vercel
```

## Project Structure

```
├── src/app/page.tsx             # UI
├── src/app/api/convert/route.ts # Conversion API (calls TTS directly)
└── convert_worker.py            # Optional Python worker (for local use)
```
