# api/push_notifications.py
import time
import logging
from typing import Iterable, List, Dict, Any, Optional

import requests

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH = 100            # Expo recommends <= 100 messages per request
DEFAULT_TIMEOUT = 8        # seconds
RETRIES = 2                # total attempts = 1 + RETRIES
RETRY_BACKOFF = 1.5        # seconds between retries (grows linearly)

logger = logging.getLogger(__name__)

__all__ = ["send_push_notification", "send_single_push"]


def _chunk(items: List[Any], size: int) -> Iterable[List[Any]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _looks_like_expo_token(token: str) -> bool:
    # Typical Expo token format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
    return isinstance(token, str) and token.startswith("ExponentPushToken[")


def send_single_push(
    token: str,
    title: str,
    body: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    priority: str = "high",
    ttl: Optional[int] = None,
    channel_id: Optional[str] = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Convenience wrapper for sending to one token.
    """
    return send_push_notification(
        [token], title, body, data=data, priority=priority, ttl=ttl,
        channel_id=channel_id, timeout=timeout
    )


def send_push_notification(
    tokens: Iterable[str],
    title: str,
    body: str,
    *,
    data: Optional[Dict[str, Any]] = None,
    priority: str = "high",      # 'default' | 'normal' | 'high'
    ttl: Optional[int] = None,   # seconds (e.g., 3600)
    channel_id: Optional[str] = None,  # Android channel ID
    timeout: int = DEFAULT_TIMEOUT,
) -> Dict[str, Any]:
    """
    Send Expo push notifications to many tokens.

    Args:
        tokens: Iterable of Expo tokens (e.g., 'ExponentPushToken[...]')
        title: Notification title
        body: Notification body
        data: Optional extra payload (dict)
        priority: Expo priority ('default'|'normal'|'high')
        ttl: Time-to-live in seconds
        channel_id: Android channel ID
        timeout: Per-request timeout in seconds

    Returns:
        {
          "ok": bool,
          "success": [list of tokens delivered],
          "failed": [{"token": "...", "error": "..."}],
          "responses": [raw Expo API responses]
        }
    """
    # Normalize & pre-validate tokens
    tokens = [t for t in (tokens or []) if t]
    if not tokens:
        return {"ok": True, "success": [], "failed": [], "responses": []}

    valid_tokens: List[str] = []
    failed: List[Dict[str, str]] = []
    for t in tokens:
        if _looks_like_expo_token(t):
            valid_tokens.append(t)
        else:
            failed.append({"token": t, "error": "invalid_token_format"})

    if not valid_tokens:
        return {"ok": False, "success": [], "failed": failed, "responses": []}

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    all_success: List[str] = []
    responses: List[Dict[str, Any]] = []

    for batch in _chunk(valid_tokens, MAX_BATCH):
        messages = []
        for t in batch:
            msg = {
                "to": t,
                "sound": "default",
                "title": title,
                "body": body,
                "data": data or {},
                "priority": priority,
            }
            if ttl is not None:
                msg["ttl"] = int(ttl)
            if channel_id:
                msg["channelId"] = channel_id
            messages.append(msg)

        # Retry on transient issues/timeouts
        last_error = None
        for attempt in range(RETRIES + 1):
            try:
                resp = requests.post(EXPO_PUSH_URL, json=messages, headers=headers, timeout=timeout)
                try:
                    payload = resp.json()
                except Exception:
                    payload = {"_non_json_response": resp.text, "_status_code": resp.status_code}

                responses.append(payload)

                ok_http = (resp.status_code == 200)
                has_global_errors = bool(payload.get("errors"))
                per_item = payload.get("data") or []

                # If HTTP ok, parse per-item statuses
                if ok_http:
                    for i, item in enumerate(per_item):
                        token = batch[i] if i < len(batch) else None
                        status = item.get("status")
                        if status == "ok":
                            if token:
                                all_success.append(token)
                        else:
                            msg = item.get("message") or item.get("details") or "expo_status_error"
                            failed.append({"token": token or "unknown", "error": str(msg)})

                    # If we got a 200 but also a top-level 'errors', treat as retryable unless last attempt
                    if has_global_errors and attempt < RETRIES:
                        time.sleep(RETRY_BACKOFF * (attempt + 1))
                        continue

                    break  # success or handled errors; move on to next batch

                # Non-200: retry unless last attempt
                if attempt < RETRIES:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue

                # Last attempt failed: mark whole batch as failed
                for t in batch:
                    failed.append({"token": t, "error": f"http_{resp.status_code}"})
                break

            except requests.RequestException as e:
                last_error = str(e)
                logger.warning("Expo push request exception on attempt %s: %s", attempt + 1, e)
                if attempt < RETRIES:
                    time.sleep(RETRY_BACKOFF * (attempt + 1))
                    continue
                for t in batch:
                    failed.append({"token": t, "error": f"request_exception: {last_error}"})
                break

    ok = len(failed) == 0
    return {"ok": ok, "success": all_success, "failed": failed, "responses": responses}
