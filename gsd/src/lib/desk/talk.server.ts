import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TalkLine = {
  t: number;
  asset: string;
  interval: string;
  stage: string;
  bot: string;
  signal?: string;
  raw?: string;
};

function dir() {
  return process.env.GSD_DATA_DIR || "/tmp/gsd";
}

function path() {
  return join(dir(), "talk.json");
}

function load(): TalkLine[] {
  try {
    const raw = JSON.parse(readFileSync(path(), "utf8")) as { lines?: TalkLine[] };
    return Array.isArray(raw.lines) ? raw.lines : [];
  } catch {
    return [];
  }
}

function save(lines: TalkLine[]) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(path(), JSON.stringify({ lines: lines.slice(-250) }));
}

export function recordTalk(line: TalkLine) {
  const lines = load();
  lines.push(line);
  save(lines);
}

export function readTalk() {
  return load().slice(-120).reverse();
}
