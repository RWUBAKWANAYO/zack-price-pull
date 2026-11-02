import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { pullUber } from './sources/uber/pull.js';
import { sourceKey, unableToPull } from './sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const pulls = {
  uber: pullUber,
};

export async function quoteRoute({ source, pickup, dropoff }) {
  const key = sourceKey(source);
  const from = String(pickup || '').trim();
  const to = String(dropoff || '').trim();
  const pull = pulls[key];
  if (!from || !to || !pull) return unableToPull(key);
  return pull({ pickup: from, dropoff: to });
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const pickup = arg('pickup');
  const dropoff = arg('dropoff');
  const source = arg('source');
  if (!pickup || !dropoff) {
    console.error('Usage: npm run quote -- --pickup "..." --dropoff "..." [--source uber]');
    process.exit(1);
  }
  quoteRoute({ source, pickup, dropoff })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.error) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err.message);
      process.stdout.write(`${JSON.stringify(unableToPull(source), null, 2)}\n`);
      process.exit(1);
    });
}
