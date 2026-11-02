const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dbFile = process.env.DATABASE_FILE || path.join(__dirname, "database", "friendship.sqlite");
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 visitor_id TEXT NOT NULL,
 display_name TEXT,
 answers TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS quiz_results (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 visitor_id TEXT NOT NULL,
 score INTEGER NOT NULL,
 answers TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS approvals (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 visitor_id TEXT NOT NULL UNIQUE,
 display_name TEXT,
 certificate_code TEXT NOT NULL UNIQUE,
 approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 visitor_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 details TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_applications_visitor ON applications(visitor_id);
`);

const adminUser = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
const existing = db.prepare("SELECT id FROM admins WHERE username=?").get(adminUser);
if (!existing) {
  db.prepare("INSERT INTO admins(username,password_hash) VALUES(?,?)")
    .run(adminUser, bcrypt.hashSync(adminPass, 12));
  console.log(`Admin account initialized for username: ${adminUser}`);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(session({
  name: "bestie.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 240, standardHeaders: true, legacyHeaders: false }));

const clean = (v, max=120) => String(v ?? "").trim().slice(0, max);
const visitor = req => clean(req.body.visitorId || req.query.visitorId || "anonymous", 80).replace(/[^a-zA-Z0-9_-]/g, "") || "anonymous";
const logEvent = db.prepare("INSERT INTO events(visitor_id,event_type,details) VALUES(?,?,?)");
const requireAdmin = (req,res,next) => req.session.admin ? next() : res.status(401).json({ error: "Admin sign-in required." });

app.get("/api/health", (req,res) => res.json({ ok: true, service: "Best Friend Experience API" }));

app.post("/api/event", (req,res) => {
  const type = clean(req.body.type, 40);
  const allowed = ["page_view","no_attempt","secret_surprise","certificate_download","restart","courtroom_trial"];
  if (!allowed.includes(type)) return res.status(400).json({ error: "Unsupported event." });
  logEvent.run(visitor(req), type, JSON.stringify({ page: clean(req.body.page,40) }));
  res.json({ ok: true });
});

app.post("/api/application", (req,res) => {
  const id = visitor(req);
  const name = clean(req.body.name, 50);
  const answers = req.body.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return res.status(400).json({ error: "Please complete the application." });
  db.prepare("INSERT INTO applications(visitor_id,display_name,answers) VALUES(?,?,?)")
    .run(id, name || null, JSON.stringify(answers));
  logEvent.run(id, "application_submitted", null);
  res.status(201).json({ ok: true, message: "Application received. The Friendship Department is investigating." });
});

app.post("/api/quiz", (req,res) => {
  const id = visitor(req);
  const score = Math.max(0, Math.min(100, Number(req.body.score) || 0));
  const answers = req.body.answers;
  if (!Array.isArray(answers) || answers.length < 1) return res.status(400).json({ error: "Quiz answers are required." });
  db.prepare("INSERT INTO quiz_results(visitor_id,score,answers) VALUES(?,?,?)").run(id, score, JSON.stringify(answers));
  logEvent.run(id, "quiz_completed", JSON.stringify({ score }));
  res.status(201).json({ ok: true, score });
});

app.post("/api/approval", (req,res) => {
  const id = visitor(req);
  const name = clean(req.body.name, 50);
  const code = "BFF-" + Math.random().toString(36).slice(2,6).toUpperCase() + "-" + Date.now().toString(36).toUpperCase().slice(-5);
  const prior = db.prepare("SELECT display_name,certificate_code,approved_at FROM approvals WHERE visitor_id=?").get(id);
  if (prior) return res.json({ ok: true, approval: prior });
  db.prepare("INSERT INTO approvals(visitor_id,display_name,certificate_code) VALUES(?,?,?)").run(id, name || null, code);
  logEvent.run(id, "friendship_approved", null);
  const approval = db.prepare("SELECT display_name,certificate_code,approved_at FROM approvals WHERE visitor_id=?").get(id);
  res.status(201).json({ ok: true, approval });
});

app.get("/api/my-approval", (req,res) => {
  const id = visitor(req);
  const approval = db.prepare("SELECT display_name,certificate_code,approved_at FROM approvals WHERE visitor_id=?").get(id);
  res.json({ approval: approval || null });
});

app.post("/api/admin/login", rateLimit({ windowMs: 15*60*1000, limit: 8, standardHeaders: true, legacyHeaders: false }), (req,res) => {
  const username = clean(req.body.username, 80);
  const password = String(req.body.password || "");
  const record = db.prepare("SELECT * FROM admins WHERE username=?").get(username);
  if (!record || !bcrypt.compareSync(password, record.password_hash)) return res.status(401).json({ error: "Incorrect username or password." });
  req.session.admin = { id: record.id, username: record.username };
  res.json({ ok: true, username: record.username });
});
app.post("/api/admin/logout", requireAdmin, (req,res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/me", requireAdmin, (req,res) => res.json({ username: req.session.admin.username }));

app.get("/api/admin/stats", requireAdmin, (req,res) => {
  const count = (sql) => db.prepare(sql).get().n;
  const totalVisits = count("SELECT COUNT(*) n FROM events WHERE event_type='page_view'");
  const applications = count("SELECT COUNT(*) n FROM applications");
  const quizCount = count("SELECT COUNT(*) n FROM quiz_results");
  const approvals = count("SELECT COUNT(*) n FROM approvals");
  const noAttempts = count("SELECT COUNT(*) n FROM events WHERE event_type='no_attempt'");
  const certificates = count("SELECT COUNT(*) n FROM events WHERE event_type='certificate_download'");
  const avg = db.prepare("SELECT COALESCE(ROUND(AVG(score)),0) score FROM quiz_results").get().score;
  const recent = db.prepare(`SELECT event_type,visitor_id,created_at FROM events ORDER BY id DESC LIMIT 12`).all();
  const daily = db.prepare(`SELECT substr(created_at,1,10) day, COUNT(*) total FROM events GROUP BY day ORDER BY day DESC LIMIT 7`).all().reverse();
  res.json({ totalVisits, applications, quizCount, approvals, noAttempts, certificates, avgScore: avg, recent, daily });
});
app.get("/api/admin/applications", requireAdmin, (req,res) => {
  const rows = db.prepare("SELECT id,display_name,answers,created_at FROM applications ORDER BY id DESC LIMIT 100").all();
  res.json(rows.map(r => ({ ...r, answers: JSON.parse(r.answers) })));
});
app.get("/api/admin/quiz-results", requireAdmin, (req,res) => {
  const rows = db.prepare("SELECT id,score,answers,created_at FROM quiz_results ORDER BY id DESC LIMIT 100").all();
  res.json(rows.map(r => ({ ...r, answers: JSON.parse(r.answers) })));
});
app.get("/api/admin/export.csv", requireAdmin, (req,res) => {
  const rows = db.prepare("SELECT id,display_name,certificate_code,approved_at FROM approvals ORDER BY id DESC").all();
  const q = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = ["id,display_name,certificate_code,approved_at", ...rows.map(r => [r.id,r.display_name,r.certificate_code,r.approved_at].map(q).join(","))].join("\n");
  res.type("text/csv").attachment("friendship-approvals.csv").send(csv);
});
app.delete("/api/admin/data", requireAdmin, (req,res) => {
  const tables = ["applications","quiz_results","approvals","events"];
  const tx = db.transaction(() => tables.forEach(t => db.prepare(`DELETE FROM ${t}`).run()));
  tx();
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req,res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Best Friend Experience running at http://localhost:${PORT}`));
