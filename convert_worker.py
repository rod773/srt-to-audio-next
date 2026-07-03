import sys
import os
import json
import io

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import srt
import re
from pydub import AudioSegment
from gtts import gTTS
import requests


def synthesize_elevenlabs(api_key, voice_id, model_id, text, speed=1.0):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }
    if speed != 1.0:
        payload["text"] = f"<speak><prosody rate='{speed*100:.0f}%'>{text}</prosody></speak>"
        payload["ssml"] = True
    headers = {
        "Accept": "audio/mpeg",
        "xi-api-key": api_key,
        "Content-Type": "application/json",
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=120)
    if resp.status_code != 200:
        raise Exception(f"ElevenLabs API Error: {resp.status_code} {resp.text}")
    return resp.content


def synthesize_gtts(text, lang="en", accent_tld=""):
    if accent_tld.strip():
        tts = gTTS(text=text, lang=lang, tld=accent_tld.strip())
    else:
        tts = gTTS(text=text, lang=lang)
    temp_path = "_gtts_tmp.mp3"
    tts.save(temp_path)
    with open(temp_path, "rb") as f:
        data = f.read()
    try:
        os.remove(temp_path)
    except Exception:
        pass
    return data


def main():
    params = json.loads(sys.stdin.read())

    engine = params["engine"]
    srt_path = params["srt_path"]
    max_speed = params["max_speed"]
    output_dir = params.get("output_dir", os.path.dirname(srt_path))

    api_key = params.get("api_key", "")
    voice_id = params.get("voice_id", "")
    model_id = params.get("model_id", "eleven_flash_v2_5")
    gtts_lang = params.get("gtts_lang", "en")
    gtts_accent = params.get("gtts_accent", "")

    output_file = os.path.join(output_dir, "output_audio.mp3")
    partial_file = os.path.join(output_dir, "output_partial.mp3")
    progress_file = os.path.join(output_dir, "progress.txt")

    with open(srt_path, "r", encoding="utf-8") as f:
        subs = list(srt.parse(f.read()))

    if os.path.exists(progress_file):
        with open(progress_file, "r") as pf:
            last_index = int(pf.read().strip() or 0)
    else:
        last_index = 0

    if os.path.exists(partial_file):
        final_audio = AudioSegment.from_file(partial_file, format="mp3")
    else:
        final_audio = AudioSegment.silent(duration=0)

    total = len(subs)
    for idx, sub in enumerate(subs):
        if idx < last_index:
            continue

        start_ms = int(sub.start.total_seconds() * 1000)
        end_ms = int(sub.end.total_seconds() * 1000)
        duration_ms = end_ms - start_ms
        text = sub.content.replace("\n", " ")
        word_count = len(re.findall(r"\w+", text))
        est_read_time = int((word_count / 2.5) * 1000)
        speed = min(max_speed, est_read_time / duration_ms) if est_read_time > duration_ms else 1.0

        progress = {
            "current": idx + 1,
            "total": total,
            "start": str(sub.start),
            "end": str(sub.end),
            "text": text[:60],
            "speed": round(speed, 2),
        }
        print(json.dumps(progress), flush=True)

        if engine == "gtts":
            audio_bytes = synthesize_gtts(text, lang=gtts_lang, accent_tld=gtts_accent)
        elif engine == "elevenlabs":
            audio_bytes = synthesize_elevenlabs(api_key, voice_id, model_id, text, speed)
        else:
            raise Exception(f"Unsupported engine: {engine}")

        seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format="mp3")
        if len(seg) > duration_ms and duration_ms > 0:
            playback_speed = len(seg) / duration_ms
            seg = seg.speedup(playback_speed=playback_speed)

        if start_ms > len(final_audio):
            final_audio += AudioSegment.silent(duration=start_ms - len(final_audio))

        final_audio += seg
        final_audio.export(partial_file, format="mp3")
        with open(progress_file, "w") as pf:
            pf.write(str(idx + 1))

    final_audio.export(output_file, format="mp3")

    if os.path.exists(partial_file):
        os.remove(partial_file)
    if os.path.exists(progress_file):
        os.remove(progress_file)

    print(json.dumps({"done": True, "output": output_file}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)
