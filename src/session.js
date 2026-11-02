import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { sourceKey } from './sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, '.browser.lock');
dotenv.config({ path: path.join(root, '.env') });

export function headless(env = process.env) {
  const value = String(env.HEADLESS ?? 'false').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== 'ESRCH';
  }
}

async function acquireLock() {
  await fs.mkdir(root, { recursive: true });
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      await handle.writeFile(String(process.pid));
      return handle;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const current = Number(await fs.readFile(lockPath, 'utf8').catch(() => ''));
      if (!(await pidAlive(current))) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      await sleep(1000);
    }
  }
  throw new Error('Timed out waiting for the browser lock');
}

export async function withBrowser(source, fn) {
  const sessionDir = path.join(root, 'session', sourceKey(source));
  await fs.mkdir(sessionDir, { recursive: true });
  const handle = await acquireLock();
  let context;
  try {
    context = await chromium.launchPersistentContext(sessionDir, {
      headless: headless(),
      viewport: { width: 1280, height: 900 },
      locale: 'en-GB',
    });
    context.setDefaultNavigationTimeout(10000);
    const page = context.pages()[0] || (await context.newPage());
    return await fn(page);
  } finally {
    if (context) {
      await Promise.all(context.pages().map((item) => item.close({ runBeforeUnload: false }).catch(() => {})));
      await context.close().catch(() => {});
    }
    await handle.close().catch(() => {});
    await fs.rm(lockPath, { force: true });
  }
}
