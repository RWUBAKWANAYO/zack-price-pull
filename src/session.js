import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { sourceKey } from './sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, '.browser.lock');
dotenv.config({ path: path.join(root, '.env') });

export function headless(env = process.env, host = process) {
  const value = String(env.HEADLESS ?? '').trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes' || value === 'on') return true;
  const platform = host.platform || process.platform;
  if (platform === 'linux' && !String(env.DISPLAY || '').trim()) return true;
  return false;
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

function heavyRequest(url, type) {
  if (type === 'media') return true;
  return /maps\.googleapis|maps\.gstatic|maps\.google|doubleclick|googletagmanager|google-analytics|facebook\.net|hotjar/i.test(url);
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
      args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-extensions', '--mute-audio', '--renderer-process-limit=2'],
    });
    await context.route('**/*', (route) => {
      const request = route.request();
      if (heavyRequest(request.url(), request.resourceType())) return route.abort();
      return route.continue();
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
