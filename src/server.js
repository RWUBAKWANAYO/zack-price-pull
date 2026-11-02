import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAuth } from './auth.js';
import { loginUber } from './sources/uber/login.js';
import { quoteRoute } from './quote.js';
import { unableToPull } from './sources.js';

const port = Number(process.env.PORT || 8787);
const homePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'home.html');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function routeRequest({ method, url, body, auth, quote, home }) {
  const pathname = String(url || '').split('?')[0];
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: home };
  }
  if (method === 'GET' && pathname === '/auth') {
    return json(200, await auth.list());
  }
  const start = pathname.match(/^\/auth\/([a-z0-9]+)\/start$/);
  if (method === 'POST' && start) return json(200, auth.start(start[1]));
  const code = pathname.match(/^\/auth\/([a-z0-9]+)\/code$/);
  if (method === 'POST' && code) {
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      return json(400, { ok: false, error: 'Enter the verification code' });
    }
    const result = auth.submitCode(code[1], parsed.code ? parsed.code : parsed);
    return json(result.ok ? 200 : 400, result);
  }
  if (method === 'POST' && pathname === '/quote') {
    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      return json(400, unableToPull());
    }
    if (!parsed.pickup || !parsed.dropoff) return json(400, unableToPull(parsed.source));
    return json(200, await quote(parsed));
  }
  return json(404, unableToPull());
}

export function createServer(deps) {
  return http.createServer(async (req, res) => {
    try {
      const body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req);
      const result = await routeRequest({ method: req.method, url: req.url, body, ...deps });
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    } catch (err) {
      console.error(err.message);
      const failed = json(400, unableToPull());
      res.writeHead(failed.status, failed.headers);
      res.end(failed.body);
    }
  });
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const home = await fs.readFile(homePath, 'utf8');
  const auth = createAuth({ login: loginUber });
  const server = createServer({ auth, quote: quoteRoute, home });
  server.listen(port, () => {
    console.log(`Zack price pull listening on ${port}`);
  });
}
