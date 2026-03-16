import base64
import io
import json
import os
import sys
from typing import Any

import av
import requests
from PIL import Image, ImageOps

SIGNAL_KEYS = ["motion", "subtitle", "chart", "identity"]


def is_record(value: Any) -> bool:
    return isinstance(value, dict)


def as_finite_number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and value == value and value not in (float("inf"), float("-inf")) else None


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def round_value(value: float, digits: int = 2) -> float:
    factor = 10 ** digits
    return round(value * factor) / factor


def first_number(record: dict[str, Any] | None, keys: list[str]) -> float | None:
    if not record:
        return None
    for key in keys:
        candidate = as_finite_number(record.get(key))
        if candidate is not None:
            return candidate
    return None


def derive_heuristic_signal(candidate: dict[str, Any], signal: str) -> dict[str, Any]:
    metadata = candidate.get("metadata") if is_record(candidate.get("metadata")) else {}
    expected_duration = as_finite_number(candidate.get("expected_duration_seconds")) or 0.0
    output_duration = as_finite_number(candidate.get("output_duration_seconds"))
    duration_ratio = output_duration / expected_duration if output_duration is not None and expected_duration > 0 else None

    if signal == "motion":
        metadata_score = first_number(metadata, ["motion_score", "motionScore", "motion_coherence_score"])
        if metadata_score is not None:
            return {
                "score": clamp(metadata_score, 0, 100),
                "confidence": 0.72,
                "reasons": ["derived_from_motion_metadata"],
                "evidence": {"source": "metadata"},
            }
        score = 62
        if duration_ratio is not None:
            if 0.94 <= duration_ratio <= 1.08:
                score = 76
            elif 0.9 <= duration_ratio <= 1.12:
                score = 68
            else:
                score = 54
        return {
            "score": score,
            "confidence": 0.62,
            "reasons": ["duration_ratio_missing" if duration_ratio is None else "duration_ratio_heuristic"],
            "evidence": {"duration_ratio": duration_ratio},
        }

    if signal == "subtitle":
        metadata_score = first_number(metadata, ["subtitle_score", "subtitleScore", "subtitle_safe_score"])
        if metadata_score is not None:
            return {
                "score": clamp(metadata_score, 0, 100),
                "confidence": 0.72,
                "reasons": ["derived_from_subtitle_metadata"],
                "evidence": {"source": "metadata"},
            }
        subtitles_expected = bool(candidate.get("subtitles_expected"))
        return {
            "score": 68 if subtitles_expected else 80,
            "confidence": 0.58,
            "reasons": ["subtitle_expected_without_vlm" if subtitles_expected else "subtitle_not_expected"],
            "evidence": {"subtitle_text_present": bool(candidate.get("subtitle_text"))},
        }

    if signal == "chart":
        metadata_score = first_number(metadata, ["chart_score", "chartScore", "chart_safe_score"])
        if metadata_score is not None:
            return {
                "score": clamp(metadata_score, 0, 100),
                "confidence": 0.72,
                "reasons": ["derived_from_chart_metadata"],
                "evidence": {"source": "metadata"},
            }
        chart_expected = bool(candidate.get("chart_expected"))
        return {
            "score": 68 if chart_expected else 78,
            "confidence": 0.58,
            "reasons": ["chart_expected_without_vlm" if chart_expected else "chart_not_expected"],
            "evidence": {"chart_expected": chart_expected},
        }

    metadata_score = first_number(metadata, ["identity_score", "identityScore", "mascot_identity_preservation_score"])
    if metadata_score is not None:
        return {
            "score": clamp(metadata_score, 0, 100),
            "confidence": 0.72,
            "reasons": ["derived_from_identity_metadata"],
            "evidence": {"source": "metadata"},
        }
    reference_path = candidate.get("reference_image_path")
    return {
        "score": 74 if isinstance(reference_path, str) and reference_path else 60,
        "confidence": 0.64,
        "reasons": ["reference_identity_anchor_present" if isinstance(reference_path, str) and reference_path else "reference_identity_anchor_missing"],
        "evidence": {"reference_image_path": reference_path if isinstance(reference_path, str) else None},
    }


def heuristic_response(parsed: dict[str, Any], reason: str | None = None, extra_metadata: dict[str, Any] | None = None) -> dict[str, Any]:
    candidate = parsed["candidate"]
    signals = {signal: derive_heuristic_signal(candidate, signal) for signal in SIGNAL_KEYS}
    confidence = sum(float(signals[signal].get("confidence", 0.6)) for signal in SIGNAL_KEYS) / len(SIGNAL_KEYS)
    metadata = {
        "transport": "process_wrapper_heuristic",
        "backend": "heuristic",
        "request_prompt_version": parsed.get("prompt_version") if isinstance(parsed.get("prompt_version"), str) else None,
        "artifact_path_count": len(candidate.get("artifact_paths", [])) if isinstance(candidate.get("artifact_paths"), list) else 0,
        "output_video_exists": isinstance(candidate.get("output_video_path"), str) and os.path.exists(candidate["output_video_path"]),
    }
    if reason:
        metadata["fallback_reason"] = reason
    if extra_metadata:
        metadata.update(extra_metadata)
    return {
        "summary": "Process-local judge wrapper completed with heuristic fallback.",
        "confidence": round_value(confidence, 3),
        "signals": signals,
        "metadata": metadata,
    }


def safe_parse_json_text(text: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(text)
        return parsed if is_record(parsed) else None
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
        return parsed if is_record(parsed) else None
    except Exception:
        return None


def read_stdin() -> str:
    return sys.stdin.read().strip()


def pick_indices(length: int) -> list[int]:
    if length <= 0:
        return []
    if length == 1:
        return [0]
    if length == 2:
        return [0, 1]
    return sorted(set([0, length // 2, length - 1]))


def extract_video_frames(video_path: str, max_dimension: int = 768) -> list[Image.Image]:
    frames: list[Image.Image] = []
    container = av.open(video_path)
    try:
        decoded: list[Image.Image] = []
        for frame in container.decode(video=0):
            decoded.append(frame.to_image().convert("RGB"))
        for index in pick_indices(len(decoded)):
            image = decoded[index]
            scaled = ImageOps.contain(image, (max_dimension, max_dimension), Image.Resampling.LANCZOS)
            frames.append(scaled)
    finally:
        container.close()
    return frames


def load_reference_image(reference_path: str, max_dimension: int = 768) -> Image.Image:
    with Image.open(reference_path) as image:
        rgb = image.convert("RGB")
        return ImageOps.contain(rgb, (max_dimension, max_dimension), Image.Resampling.LANCZOS)


def create_contact_sheet(frames: list[Image.Image]) -> Image.Image:
    if not frames:
        raise ValueError("No frames available for contact sheet.")
    target_width = 512
    target_height = 512
    gutter = 12
    canvas_width = target_width * len(frames) + gutter * (len(frames) - 1)
    canvas = Image.new("RGB", (canvas_width, target_height), color=(12, 12, 12))
    for index, frame in enumerate(frames):
        fitted = ImageOps.contain(frame, (target_width, target_height), Image.Resampling.LANCZOS)
        x = index * (target_width + gutter) + (target_width - fitted.width) // 2
        y = (target_height - fitted.height) // 2
        canvas.paste(fitted, (x, y))
    return canvas


def image_to_base64(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def normalize_signal(raw_signal: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    signal = raw_signal if is_record(raw_signal) else {}
    score = as_finite_number(signal.get("score"))
    confidence = as_finite_number(signal.get("confidence"))
    reasons = signal.get("reasons") if isinstance(signal.get("reasons"), list) else []
    evidence = signal.get("evidence") if is_record(signal.get("evidence")) else {}
    return {
        "score": round_value(clamp(score if score is not None else float(fallback["score"]), 0, 100), 2),
        "confidence": round_value(clamp(confidence if confidence is not None else float(fallback["confidence"]), 0, 1), 3),
        "reasons": [value.strip() for value in reasons if isinstance(value, str) and value.strip()],
        "evidence": evidence,
    }


def build_system_prompt() -> str:
    return (
        "You are a strict sidecar video judge for a production explainer studio. "
        "Return compact JSON only. Score 0-100 for motion, subtitle, chart, identity. "
        "Use conservative confidence 0-1. Do not invent missing evidence."
    )


def build_user_prompt(parsed: dict[str, Any], frame_count: int, reference_available: bool) -> str:
    candidate = parsed["candidate"]
    subtitle_text = candidate.get("subtitle_text") if isinstance(candidate.get("subtitle_text"), str) else ""
    narration = candidate.get("narration") if isinstance(candidate.get("narration"), str) else ""
    return (
        "Evaluate the sidecar candidate.\n"
        f"shot_id: {parsed['shot_id']}\n"
        f"candidate_id: {parsed['candidate_id']}\n"
        f"expected_duration_seconds: {candidate.get('expected_duration_seconds')}\n"
        f"output_duration_seconds: {candidate.get('output_duration_seconds')}\n"
        f"subtitles_expected: {bool(candidate.get('subtitles_expected'))}\n"
        f"chart_expected: {bool(candidate.get('chart_expected'))}\n"
        f"frame_contact_sheet_present: {frame_count > 0}\n"
        f"reference_image_present: {reference_available}\n"
        f"subtitle_text: {subtitle_text[:500]}\n"
        f"narration: {narration[:700]}\n"
        "Image 1 is the output video contact sheet in chronological order. "
        "Image 2 is the character/reference image if present.\n"
        "Return JSON with this exact shape:\n"
        "{"
        "\"summary\": string, "
        "\"confidence\": number, "
        "\"signals\": {"
        "\"motion\": {\"score\": number, \"confidence\": number, \"reasons\": string[], \"evidence\": object}, "
        "\"subtitle\": {\"score\": number, \"confidence\": number, \"reasons\": string[], \"evidence\": object}, "
        "\"chart\": {\"score\": number, \"confidence\": number, \"reasons\": string[], \"evidence\": object}, "
        "\"identity\": {\"score\": number, \"confidence\": number, \"reasons\": string[], \"evidence\": object}"
        "}, "
        "\"metadata\": {\"transport\": string, \"backend\": string}"
        "}"
    )


def call_ollama(model: str, host: str, parsed: dict[str, Any], images: list[str], timeout_seconds: float) -> dict[str, Any]:
    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": build_system_prompt()},
            {"role": "user", "content": build_user_prompt(parsed, max(0, len(images) - 1), len(images) > 1), "images": images},
        ],
        "options": {"temperature": 0.1},
    }
    response = requests.post(
        f"{host.rstrip('/')}/api/chat",
        json=payload,
        timeout=(10.0, timeout_seconds),
    )
    response.raise_for_status()
    parsed_response = response.json()
    content = parsed_response.get("message", {}).get("content", "")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Ollama returned an empty content payload.")
    payload_json = safe_parse_json_text(content)
    if payload_json is None:
        raise ValueError("Ollama response did not contain valid JSON.")
    return payload_json


def build_actual_response(parsed: dict[str, Any]) -> dict[str, Any]:
    candidate = parsed["candidate"]
    output_video_path = candidate.get("output_video_path")
    if not isinstance(output_video_path, str) or not output_video_path or not os.path.exists(output_video_path):
        return heuristic_response(parsed, "output_video_missing")

    try:
        frames = extract_video_frames(output_video_path)
    except Exception as error:
        return heuristic_response(parsed, "frame_extraction_failed", {"error": str(error)})
    if not frames:
        return heuristic_response(parsed, "frame_extraction_empty")

    images = [image_to_base64(create_contact_sheet(frames))]
    reference_available = False
    reference_path = candidate.get("reference_image_path")
    if isinstance(reference_path, str) and reference_path and os.path.exists(reference_path):
        try:
            images.append(image_to_base64(load_reference_image(reference_path)))
            reference_available = True
        except Exception:
            reference_available = False

    model = (os.environ.get("SIDECAR_LOCAL_VLM_MODEL") or "qwen2.5vl:7b").strip()
    host = (os.environ.get("SIDECAR_LOCAL_VLM_OLLAMA_HOST") or os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434").strip()
    timeout_seconds = float(os.environ.get("SIDECAR_LOCAL_VLM_OLLAMA_TIMEOUT_SECONDS", "90"))

    try:
        raw = call_ollama(model, host, parsed, images, timeout_seconds)
    except Exception as error:
        return heuristic_response(
            parsed,
            "ollama_request_failed",
            {
                "error": str(error),
                "backend": "ollama",
                "model": model,
                "transport_attempted": "ollama_chat_vision",
                "frame_count": len(frames),
                "reference_image_included": reference_available,
            },
        )

    response_signals = raw.get("signals") if is_record(raw.get("signals")) else {}
    heuristic_signals = {signal: derive_heuristic_signal(candidate, signal) for signal in SIGNAL_KEYS}
    signals = {
        signal: normalize_signal(response_signals.get(signal), heuristic_signals[signal]) for signal in SIGNAL_KEYS
    }
    overall_confidence = as_finite_number(raw.get("confidence"))
    if overall_confidence is None:
        overall_confidence = sum(float(signals[signal]["confidence"]) for signal in SIGNAL_KEYS) / len(SIGNAL_KEYS)

    metadata = raw.get("metadata") if is_record(raw.get("metadata")) else {}
    metadata.update(
        {
            "transport": "ollama_chat_vision",
            "backend": "ollama",
            "model": model,
            "host": host,
            "frame_count": len(frames),
            "reference_image_included": reference_available,
            "heuristic_fallback_used": False,
        }
    )

    return {
        "summary": raw.get("summary") if isinstance(raw.get("summary"), str) and raw.get("summary").strip() else "Local VLM judged the sidecar candidate with an Ollama vision model.",
        "confidence": round_value(clamp(overall_confidence, 0, 1), 3),
        "signals": signals,
        "metadata": metadata,
    }


def main() -> None:
    raw = read_stdin()
    if not raw:
        raise ValueError("Local VLM judge stdin payload is empty.")
    parsed = json.loads(raw)
    if not is_record(parsed) or not is_record(parsed.get("candidate")):
        raise ValueError("Local VLM judge request is invalid.")
    sys.stdout.write(json.dumps(build_actual_response(parsed)) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(f"{error}\n")
        sys.exit(1)
