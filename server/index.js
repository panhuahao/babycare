import path from "node:path";
import fs from "node:fs";
import express from "express";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "bbcare.sqlite");
const DIST_DIR = process.env.DIST_DIR ?? path.resolve(process.cwd(), "dist");

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function openDb() {
  ensureDir(DB_PATH);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  const row = db.prepare("SELECT id FROM state WHERE id = 1").get();
  if (!row) {
    db.prepare("INSERT INTO state (id, json, updated_at) VALUES (1, ?, 0)").run(JSON.stringify({ pregnancyInfo: null, events: [] }));
  }
  return db;
}

function normalizeEvents(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((e) => typeof e?.id === "string" && typeof e?.type === "string" && typeof e?.ts === "number")
    .map((e) => ({ id: e.id, type: e.type, ts: e.ts }))
    .slice(0, 2000);
}

function normalizePregnancyInfo(input) {
  const pi = input ?? {};
  if (!pi || typeof pi !== "object") return { lmpDate: "", babyName: "" };
  return {
    lmpDate: typeof pi.lmpDate === "string" ? pi.lmpDate : "",
    babyName: typeof pi.babyName === "string" ? pi.babyName : ""
  };
}

function readState(db) {
  const row = db.prepare("SELECT json, updated_at FROM state WHERE id = 1").get();
  let parsed = {};
  try {
    parsed = JSON.parse(row?.json ?? "{}");
  } catch {}
  const pregnancyInfo = normalizePregnancyInfo(parsed?.pregnancyInfo);
  const events = normalizeEvents(parsed?.events);
  const updatedAt = typeof row?.updated_at === "number" ? row.updated_at : 0;
  return { pregnancyInfo, events, updatedAt };
}

function writeState(db, payload) {
  const pregnancyInfo = normalizePregnancyInfo(payload?.pregnancyInfo);
  const events = normalizeEvents(payload?.events);
  const updatedAt = typeof payload?.updatedAt === "number" ? payload.updatedAt : Date.now();
  db.prepare("UPDATE state SET json = ?, updated_at = ? WHERE id = 1").run(JSON.stringify({ pregnancyInfo, events }), updatedAt);
  return { pregnancyInfo, events, updatedAt };
}

const db = openDb();
const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state", (_req, res) => {
  res.json(readState(db));
});

app.put("/api/state", (req, res) => {
  const next = writeState(db, req.body);
  res.json(next);
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: "index.html" }));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`bbcare server listening on ${PORT}\n`);
});

