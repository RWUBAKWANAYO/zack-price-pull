import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceKey } from './sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function statusPath(source) {
  return path.join(root, 'session', `${sourceKey(source)}.status.json`);
}

export async function writeSessionState(source, state) {
  const file = statusPath(source);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ state, at: new Date().toISOString() }));
}

async function profileState(source) {
  try {
    const entries = await fs.readdir(path.join(root, 'session', sourceKey(source)));
    if (entries.length) return 'signed-in';
  } catch {
    return 'none';
  }
  return 'none';
}

export async function readSessionState(source) {
  try {
    const saved = JSON.parse(await fs.readFile(statusPath(source), 'utf8'));
    if (saved && (saved.state === 'signed-in' || saved.state === 'expired')) return saved.state;
  } catch {
    return profileState(source);
  }
  return profileState(source);
}
