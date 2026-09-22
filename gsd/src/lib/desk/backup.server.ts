import { copyFileSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { notify } from "./alerts.server";

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function backups() {
  return join(dir(), "backups");
}

export function rotateBackup() {
  mkdirSync(backups(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const name of ["pilot.json", "book.json", "spend.json"] as const) {
    const src = join(dir(), name);
    try {
      copyFileSync(src, join(backups(), `${stamp}-${name}`));
    } catch {
      /* absent */
    }
  }
  try {
    const files = readdirSync(backups()).sort();
    while (files.length > 60) {
      const f = files.shift();
      if (f) unlinkSync(join(backups(), f));
    }
  } catch {
    /* */
  }
  return stamp;
}

export async function pushBackupOffsite() {
  const stamp = rotateBackup();
  let payload = "";
  try {
    payload = JSON.stringify({
      t: Date.now(),
      stamp,
      pilot: JSON.parse(readFileSync(join(dir(), "pilot.json"), "utf8")),
      book: JSON.parse(readFileSync(join(dir(), "book.json"), "utf8")),
    });
  } catch {
    payload = `backup ${stamp}`;
  }
  const url = process.env.BACKUP_URL;
  if (url) {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    }).catch(() => null);
  }
  await notify("GSD backup", `snapshot ${stamp} · ${Math.round(payload.length / 1024)} ko`);
  writeFileSync(join(dir(), "last-backup.txt"), stamp);
  return stamp;
}

export function lastBackup() {
  try {
    return readFileSync(join(dir(), "last-backup.txt"), "utf8").trim();
  } catch {
    return null;
  }
}
