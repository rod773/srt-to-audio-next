# SRT → Audio Converter

Convert subtitle (.srt) files to spoken audio using **gTTS** (free) or **ElevenLabs** API.

A Next.js web UI that calls a Python TTS backend.

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+ with pip

## Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies
npm install
```

## Usage

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Drag or select an `.srt` file
2. Choose engine: **gTTS** (free) or **ElevenLabs** (API key required)
3. Adjust settings (language, accent, voice ID, max speed)
4. Click **Start Conversion**
5. Download the resulting MP3

## Engines

| Engine | Cost | Features |
|--------|------|----------|
| gTTS | Free | Google Text-to-Speech, language & accent selection |
| ElevenLabs | API credits | High-quality voices, speed control, model selection |

## Project Structure

```
├── src/app/page.tsx          # Main UI
├── src/app/api/convert/      # Conversion API (start, progress, cancel)
├── src/app/api/output/       # Download API
├── convert_worker.py         # Python TTS worker (called by API)
├── srt_to_audio.py           # Original Tkinter version
└── uploads/ & output/        # Temp file directories
```
