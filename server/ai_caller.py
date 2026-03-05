import json
import os
import sys
import time
import urllib.error
import urllib.request


def _post_json(url: str, api_key: str, payload: dict, timeout_s: int):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {api_key}")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            ct = (resp.headers.get("content-type") or "").lower()
            parsed = json.loads(body) if "application/json" in ct else None
            return {"ok": True, "status": resp.status, "response": parsed, "text": body, "elapsed_ms": int((time.time() - t0) * 1000)}
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        parsed = None
        try:
            parsed = json.loads(body)
        except Exception:
            pass
        return {"ok": False, "status": e.code, "response": parsed, "text": body[:2000], "elapsed_ms": int((time.time() - t0) * 1000)}
    except urllib.error.URLError as e:
        msg = getattr(e, "reason", None)
        return {
            "ok": False,
            "status": 599,
            "error": "urlerror",
            "message": str(msg)[:800] if msg is not None else str(e)[:800],
            "elapsed_ms": int((time.time() - t0) * 1000),
        }
    except TimeoutError as e:
        return {"ok": False, "status": 599, "error": "timeout", "message": str(e)[:800], "elapsed_ms": int((time.time() - t0) * 1000)}
    except OSError as e:
        return {"ok": False, "status": 599, "error": "oserror", "message": str(e)[:800], "elapsed_ms": int((time.time() - t0) * 1000)}
    except Exception as e:
        return {"ok": False, "status": 599, "error": "unknown", "message": str(e)[:800], "elapsed_ms": int((time.time() - t0) * 1000)}


def _sleep_ms(ms: int):
    time.sleep(ms / 1000.0)


def _zhipu_payload(model: str, system_prompt: str, user_text: str, image_ref: str, thinking: bool):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": image_ref}},
                ],
            },
        ],
        "do_sample": True,
        "temperature": 0.8,
        "top_p": 0.6,
        "stream": False,
    }
    if thinking:
        payload["thinking"] = {"type": "enabled", "clear_thinking": True}
    return payload


def _dashscope_payload(model: str, system_prompt: str, user_text: str, image_ref: str, thinking: bool):
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": image_ref}},
                ],
            },
        ],
        "temperature": 0.8,
        "top_p": 0.6,
        "enable_thinking": bool(thinking),
        "enable_search": False,
        "stream": False,
    }


def _dashscope_fallback_payload(model: str, system_prompt: str, user_text: str, image_url: str, thinking: bool):
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"{user_text}\n\n图片地址：{image_url}\n（如果你无法直接查看图片，请明确说明，并给出你需要我补充的描述要点。）"},
        ],
        "temperature": 0.8,
        "top_p": 0.6,
        "enable_thinking": bool(thinking),
        "enable_search": False,
        "stream": False,
    }


def main():
    raw = sys.stdin.read()
    try:
        inp = json.loads(raw or "{}")
    except Exception:
        print(json.dumps({"ok": False, "status": 400, "error": "bad_json"}))
        return 0
    vendor = str(inp.get("vendor") or "").strip().lower()
    model = str(inp.get("model") or "").strip()
    system_prompt = str(inp.get("system") or "").strip()
    user_text = str(inp.get("userText") or "").strip()
    image_ref = str(inp.get("imageRef") or "").strip()
    image_url = str(inp.get("imageUrl") or "").strip()
    thinking = bool(inp.get("thinking")) if "thinking" in inp else True
    timeout_s = int(inp.get("timeout_s") or 25)

    try:
        if vendor == "aliyun":
            api_key = os.getenv("DASHSCOPE_API_KEY", os.getenv("BAILIAN_API_KEY", "")).strip()
            if not api_key:
                print(json.dumps({"ok": False, "status": 503, "error": "missing DASHSCOPE_API_KEY"}))
                return 0
            base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
            url = f"{base}/chat/completions"
            payload1 = _dashscope_payload(model, system_prompt, user_text, image_ref, thinking)

            last = None
            for attempt in range(2):
                last = _post_json(url, api_key, payload1, timeout_s)
                if last.get("ok"):
                    break
                st = int(last.get("status") or 0)
                if st == 400 and image_url:
                    payload2 = _dashscope_fallback_payload(model, system_prompt, user_text, image_url, thinking)
                    last = _post_json(url, api_key, payload2, timeout_s)
                    break
                if st in (429, 500, 502, 503, 504, 599):
                    _sleep_ms(450 * (attempt + 1))
                    continue
                break
            print(json.dumps(last))
            return 0

        api_key = os.getenv("ZAI_API_KEY", os.getenv("BIGMODEL_API_KEY", "")).strip()
        if not api_key:
            print(json.dumps({"ok": False, "status": 503, "error": "missing ZAI_API_KEY"}))
            return 0
        url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        payload = _zhipu_payload(model, system_prompt, user_text, image_ref, thinking)

        last = None
        for attempt in range(2):
            last = _post_json(url, api_key, payload, timeout_s)
            if last.get("ok"):
                break
            st = int(last.get("status") or 0)
            if st in (429, 500, 502, 503, 504, 599):
                _sleep_ms(450 * (attempt + 1))
                continue
            break
        print(json.dumps(last))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "status": 599, "error": "uncaught", "message": str(e)[:800]}))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
