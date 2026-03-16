import json
import os
import sys
from pathlib import Path


def _read_request() -> dict:
    request_path = os.environ.get("AUDIO_ALIGNMENT_REQUEST_PATH") or os.environ.get("EC_ALIGNMENT_REQUEST_PATH")
    if not request_path:
        raise RuntimeError("AUDIO_ALIGNMENT_REQUEST_PATH is required")
    return json.loads(Path(request_path).read_text(encoding="utf-8"))


def _write_output(payload: dict) -> None:
    output_path = os.environ.get("AUDIO_ALIGNMENT_OUTPUT_PATH") or os.environ.get("EC_ALIGNMENT_OUTPUT_PATH")
    if output_path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


def main() -> int:
    request = _read_request()

    try:
        import faster_whisper
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError("faster-whisper is not installed. Run `python -m pip install faster-whisper`.") from exc

    model_name = (os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_MODEL") or "tiny.en").strip()
    device = (os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_DEVICE") or "cpu").strip()
    compute_type = (os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_COMPUTE_TYPE") or "int8").strip()
    language = (os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_LANGUAGE") or "en").strip()
    beam_size = int((os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_BEAM_SIZE") or "1").strip())
    vad_filter = (os.environ.get("AUDIO_ALIGNMENT_FASTER_WHISPER_VAD_FILTER") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    narration_path = request.get("narrationPath")
    if not isinstance(narration_path, str) or not narration_path.strip():
        raise RuntimeError("request narrationPath is required")

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        narration_path,
        beam_size=beam_size,
        word_timestamps=True,
        language=language or None,
        vad_filter=vad_filter,
    )

    serialized_segments = []
    for segment in segments:
        words = []
        for word in segment.words or []:
            words.append(
                {
                    "word": (word.word or "").strip(),
                    "start": float(word.start or 0.0),
                    "end": float(word.end or 0.0),
                    "probability": float(word.probability) if word.probability is not None else None,
                }
            )
        serialized_segments.append(
            {
                "id": getattr(segment, "id", None),
                "start": float(segment.start),
                "end": float(segment.end),
                "text": (segment.text or "").strip(),
                "words": words,
            }
        )

    payload = {
        "provider": "faster-whisper",
        "version": getattr(faster_whisper, "__version__", None),
        "sourceKind": "provider",
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "segments": serialized_segments,
    }
    _write_output(payload)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"{exc}\n")
        raise
