import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { loginUber } from './sources/uber/login.js';
import { sourceKey } from './sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const logins = {
  uber: loginUber,
};

const requested = process.argv.slice(2).find((arg) => !arg.startsWith('-')) || 'uber';
const key = sourceKey(requested);
const login = logins[key];

if (!login) {
  console.error(`No login for ${key} yet.`);
  process.exit(1);
}

login().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
