import json
import os
import sys
import time
import urllib.request
import urllib.error


def post_json(url: str, headers: dict, payload: dict, timeout_s: int = 30):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("content-type", "application/json")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body, time.time() - t0
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        return e.code, body, time.time() - t0


def build_messages(system_prompt: str, user_prompt: str, image_url: str | None):
    if not image_url:
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    return [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        },
    ]


def probe_dashscope(model: str, system_prompt: str, user_prompt: str, image_url: str | None):
    api_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("missing DASHSCOPE_API_KEY")
    base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
    url = f"{base}/chat/completions"
    payload = {
        "model": model,
        "messages": build_messages(system_prompt, user_prompt, image_url),
        "temperature": 0.8,
        "top_p": 0.6,
        "stream": False,
    }
    return post_json(url, {"authorization": f"Bearer {api_key}"}, payload, timeout_s=30)


def probe_zhipu(model: str, system_prompt: str, user_prompt: str, image_url: str | None):
    api_key = os.getenv("ZAI_API_KEY", os.getenv("BIGMODEL_API_KEY", "")).strip()
    if not api_key:
        raise SystemExit("missing ZAI_API_KEY (or BIGMODEL_API_KEY)")
    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    payload = {
        "model": model,
        "messages": build_messages(system_prompt, user_prompt, image_url),
        "do_sample": True,
        "temperature": 0.8,
        "top_p": 0.6,
        "stream": False,
    }
    return post_json(url, {"authorization": f"Bearer {api_key}"}, payload, timeout_s=30)


def main():
    vendor = (sys.argv[1] if len(sys.argv) > 1 else "aliyun").strip().lower()
    model = (sys.argv[2] if len(sys.argv) > 2 else ("qwen3.5-flash" if vendor == "aliyun" else "glm-4.6v")).strip()
    image_url = (sys.argv[3] if len(sys.argv) > 3 else "").strip() or None
    system_prompt = os.getenv("AI_SYSTEM_PROMPT", "你是一个孕妇营养专家").strip()
    user_prompt = os.getenv(
        "AI_USER_PROMPT",
        "请根据图片判断这是什么食物/菜品，并回答： \n 1) 孕妇能不能吃 \n 2) 如果不能或不建议：说明主要危害与原因。 \n 3) 如果可以：给出食品可以提供的营养与好处，以及每天可以食用的量。 \n 输出用中文分点，尽量简洁。",
    ).strip()

    if vendor in ("aliyun", "dashscope", "bailian"):
        status, body, secs = probe_dashscope(model, system_prompt, user_prompt, image_url)
    elif vendor in ("zhipu", "zai", "bigmodel"):
        status, body, secs = probe_zhipu(model, system_prompt, user_prompt, image_url)
    else:
        raise SystemExit("vendor must be aliyun or zhipu")

    print(f"vendor={vendor} model={model} status={status} elapsed_s={secs:.2f}")
    print(body[:1200])


if __name__ == "__main__":
    main()

