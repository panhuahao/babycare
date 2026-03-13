import path from "node:path";
import { spawn } from "node:child_process";

export async function callAiViaPython(input) {
  const scriptPath = path.join(process.cwd(), "server", "ai_caller.py");
  return await new Promise((resolve, reject) => {
    const child = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`python caller failed (code ${code}): ${stderr.slice(0, 800)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch {
        reject(new Error(`python caller bad output: ${stdout.slice(0, 800)}`));
      }
    });
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}
