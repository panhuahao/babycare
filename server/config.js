import path from "node:path";

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
export const AI_CALLER = String(process.env.AI_CALLER ?? "python").trim().toLowerCase();
export const AI_TIMEOUT_S = Math.min(120, Math.max(5, Number(process.env.AI_TIMEOUT_S ?? 40) || 40));
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(path.dirname(DB_PATH), "uploads");
export const DAILY_MENU_JSON = process.env.DAILY_MENU_JSON ?? path.join(process.cwd(), "server", "daily_menu_data.json");
export const TOZ_GRAMS = 31.1034768;
export const JIJINHAO_HEADERS = {
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
};
