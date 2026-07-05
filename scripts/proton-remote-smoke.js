#!/usr/bin/env node
/**
 * Optional live check for Proton Drive remotes (no secrets in repo).
 * Usage:
 *   set PROTON_EMAIL=you@proton.me
 *   set PROTON_PASSWORD=...
 *   set PROTON_OTP_SECRET=...   (optional, TOTP base32)
 *   node scripts/proton-remote-smoke.js
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const email = process.env.PROTON_EMAIL || process.env.PROTON_USERNAME;
const password = process.env.PROTON_PASSWORD;
const otp = process.env.PROTON_OTP_SECRET || process.env.PROTON_OTP_SECRET_KEY;
const oneTime2fa = process.env.PROTON_2FA;

if (!email || !password) {
  console.log("SKIP: set PROTON_EMAIL and PROTON_PASSWORD to run live Proton smoke.");
  process.exit(0);
}

const rcloneWin = path.join(__dirname, "..", "resources", "rclone", "rclone.exe");
const rclone = process.platform === "win32" && fs.existsSync(rcloneWin) ? rcloneWin : "rclone";
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "oos-proton-smoke-"));
const cfg = path.join(cfgDir, "rclone.conf");
const remote = "proton-smoke-test";

const run = (args) => {
  const result = spawnSync(rclone, ["--config", cfg, ...args], { encoding: "utf8" });
  return { code: result.status ?? 1, out: (result.stdout || "") + (result.stderr || "") };
};

const obscure = (secret) => {
  const result = spawnSync(rclone, ["obscure", secret], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "obscure failed");
  return result.stdout.trim();
};

const options = [`username=${email}`, `password=${obscure(password)}`];
if (otp) options.push(`otp_secret_key=${obscure(otp)}`);
else if (oneTime2fa) options.push(`2fa=${oneTime2fa}`);

const create = run(["config", "create", remote, "protondrive", ...options, "--non-interactive"]);
if (create.code !== 0) {
  console.error("CREATE FAILED:\n", create.out);
  process.exit(1);
}

const list = run(["listremotes"]);
const lsd = run(["lsd", `${remote}:`]);
console.log("listremotes:", list.out.trim());
console.log("lsd:", lsd.out.trim() || "(empty or root only)");
if (lsd.code !== 0) {
  console.error("LSD FAILED:\n", lsd.out);
  process.exit(1);
}
run(["config", "delete", remote]);
console.log("proton-remote-smoke: OK");
fs.rmSync(cfgDir, { recursive: true, force: true });