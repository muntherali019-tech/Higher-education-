// Tiny JSON-file persistence for Reelmint.
// Single-process, good enough for an MVP. On Render's free tier the file lives
// on the instance disk (resets on redeploy) — set DATA_DIR to a mounted disk,
// or swap this module for Postgres/Redis for durable multi-instance storage.

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "reelmint.json");

let db = { users: {} }; // users keyed by lowercased email
let writeTimer = null;

function load() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (e) {
    console.warn("store: load failed, starting empty —", e.message);
  }
  if (!db.users) db.users = {};
}
load();

function persist() {
  // debounce writes
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
    } catch (e) {
      console.warn("store: write failed —", e.message);
    }
  }, 150);
}

export function getUser(email) {
  return db.users[String(email).toLowerCase()] || null;
}
export function getUserById(id) {
  return Object.values(db.users).find((u) => u.id === id) || null;
}
export function getUserByStripeCustomer(customer) {
  if (!customer) return null;
  return Object.values(db.users).find((u) => u.stripeCustomer === customer) || null;
}
export function saveUser(user) {
  db.users[user.email.toLowerCase()] = user;
  persist();
  return user;
}
