import path from "node:path";
import fs from "node:fs";
import express from "express";
import { DIST_DIR, PORT, UPLOAD_DIR } from "./config.js";
import { ensureDirPath, openDb } from "./state.js";
import { registerApiRoutes } from "./routes.js";

const db = openDb();
const app = express();

app.use(express.json({ limit: "8mb" }));
ensureDirPath(UPLOAD_DIR);
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "3600s" }));

registerApiRoutes(app, db);

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: "index.html" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`bbcare server listening on ${PORT}\n`);
});
