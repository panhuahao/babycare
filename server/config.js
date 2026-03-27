import fs from "node:fs";
import path from "node:path";

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (!key || process.env[key]) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {}
}

loadEnvFile();

export const PORT = Number(process.env.PORT ?? 3000);
export const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "bbcare.sqlite");
export const DIST_DIR = process.env.DIST_DIR ?? path.resolve(process.cwd(), "dist");
export const METALS_DEV_API_KEY = String(process.env.METALS_DEV_API_KEY ?? "");
export const ZAI_API_KEY = String(process.env.ZAI_API_KEY ?? process.env.BIGMODEL_API_KEY ?? "").trim();
export const ZAI_MODEL = String(process.env.ZAI_MODEL ?? process.env.BIGMODEL_MODEL ?? "glm-4.6v").trim();
export const DASHSCOPE_API_KEY = String(process.env.DASHSCOPE_API_KEY ?? process.env.BAILIAN_API_KEY ?? "").trim();
export const DASHSCOPE_MODEL = String(process.env.DASHSCOPE_MODEL ?? "qwen3.5-plus").trim();
export const DASHSCOPE_BASE_URL = String(process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1")
  .trim()
  .replace(/\/+$/, "");
export const ARK_API_KEY = String(process.env.ARK_API_KEY ?? "").trim();
export const ARK_BASE_URL = String(process.env.ARK_BASE_URL ?? "").trim().replace(/\/+$/, "");
export const ARK_TEXT_MODEL = String(process.env.ARK_TEXT_MODEL ?? "").trim();
export const ARK_TEXT_MODELS = String(process.env.ARK_TEXT_MODELS ?? "").trim();
export const MOTA_API_KEY = String(process.env.MOTA_API_KEY ?? process.env.MODELSCOPE_API_KEY ?? "").trim();
export const MOTA_BASE_URL = String(process.env.MOTA_BASE_URL ?? process.env.MODELSCOPE_BASE_URL ?? "https://api-inference.modelscope.cn/v1")
  .trim()
  .replace(/\/+$/, "");
export const MOTA_TEXT_MODEL = String(process.env.MOTA_TEXT_MODEL ?? process.env.MODELSCOPE_TEXT_MODEL ?? "").trim();
export const MOTA_TEXT_MODELS = String(process.env.MOTA_TEXT_MODELS ?? process.env.MODELSCOPE_TEXT_MODELS ?? "").trim();
export const AI_CALLER = String(process.env.AI_CALLER ?? "python").trim().toLowerCase();
export const AI_TIMEOUT_S = Math.min(120, Math.max(5, Number(process.env.AI_TIMEOUT_S ?? 40) || 40));
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(path.dirname(DB_PATH), "uploads");
export const DAILY_MENU_JSON = process.env.DAILY_MENU_JSON ?? path.join(process.cwd(), "server", "daily_menu_data.json");
export const TOZ_GRAMS = 31.1034768;
export const JIJINHAO_HEADERS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};
