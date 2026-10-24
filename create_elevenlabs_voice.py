#!/usr/bin/env python3
"""Create an ElevenLabs instant voice clone from a local audio sample."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: create_elevenlabs_voice.py <audio-file>", file=sys.stderr)
        return 2

    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not api_key:
        print("ELEVENLABS_API_KEY is not set.", file=sys.stderr)
        return 2

    audio_path = Path(sys.argv[1]).expanduser().resolve()
    if not audio_path.is_file():
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        return 2
    if audio_path.suffix.lower() not in {".mp3", ".wav", ".m4a", ".flac", ".ogg"}:
        print("Use an MP3, WAV, M4A, FLAC, or OGG audio file.", file=sys.stderr)
        return 2
    if audio_path.stat().st_size > 20 * 1024 * 1024:
        print("The audio sample must be smaller than 20 MB.", file=sys.stderr)
        return 2

    boundary = f"----JarvisElevenLabs{uuid.uuid4().hex}"
    audio = audio_path.read_bytes()
    upload_name = audio_path.name.replace('"', "_").replace("\r", "_").replace("\n", "_")
    content_type = mimetypes.guess_type(upload_name)[0] or "application/octet-stream"
    chunks = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nJARVIS - Amostra personalizada\r\n".encode(),
        (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n"
            "Instant voice clone created from the user's authorized local sample.\r\n"
        ).encode(),
        (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"files\"; "
            f"filename=\"{upload_name}\"\r\nContent-Type: {content_type}\r\n\r\n"
        ).encode(),
        audio,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    request = Request(
        "https://api.elevenlabs.io/v1/voices/add",
        data=b"".join(chunks),
        headers={
            "xi-api-key": api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            body = json.loads(error.read().decode("utf-8"))
            detail = body.get("detail", {})
            if isinstance(detail, dict):
                message = detail.get("message") or detail.get("status") or str(detail)
            else:
                message = str(detail)
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            message = "The service returned an unreadable error."
        print(f"ElevenLabs returned HTTP {error.code}: {message}", file=sys.stderr)
        return 1
    except (URLError, TimeoutError) as error:
        print(f"Could not connect to ElevenLabs: {error.reason}", file=sys.stderr)
        return 1
    except (UnicodeDecodeError, json.JSONDecodeError, OSError) as error:
        print(f"Could not read the audio or parse the response: {error}", file=sys.stderr)
        return 1

    voice_id = result.get("voice_id")
    if not isinstance(voice_id, str) or not voice_id:
        print("ElevenLabs did not return a voice ID.", file=sys.stderr)
        return 1

    print(json.dumps({
        "voice_id": voice_id,
        "requires_verification": bool(result.get("requires_verification", False)),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
