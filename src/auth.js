import { COMPANIES } from './sources.js';
import { readSessionState } from './sessionState.js';

function view(run) {
  if (!run) return null;
  return {
    step: run.step,
    message: run.message,
    needsCode: run.needsCode === true,
    running: run.running === true,
    channel: run.channel || '',
    error: run.error || '',
  };
}

export function createAuth(options = {}) {
  const companies = options.companies || COMPANIES;
  const login = options.login;
  const readState = options.readState || readSessionState;
  const runs = new Map();

  function fail(run, err) {
    if (run.settled) return;
    run.settled = true;
    run.running = false;
    run.needsCode = false;
    run.channel = '';
    run.step = 'error';
    run.message = '';
    run.error = err && err.message ? err.message : 'Sign-in failed';
    if (run.rejectCode) {
      const reject = run.rejectCode;
      run.rejectCode = null;
      run.resolveCode = null;
      reject(err);
    }
  }

  return {
    async list() {
      const rows = [];
      for (const company of companies) {
        rows.push({
          key: company.key,
          name: company.name,
          session: await readState(company.key),
          run: view(runs.get(company.key)),
        });
      }
      return rows;
    },
    start(key) {
      const existing = runs.get(key);
      if (existing && existing.running) return view(existing);
      const company = companies.find((item) => item.key === key);
      const run = {
        step: 'starting',
        message: 'Opening the browser.',
        needsCode: false,
        channel: '',
        running: true,
        error: '',
        settled: false,
        resolveCode: null,
        rejectCode: null,
      };
      runs.set(key, run);
      if (!company) {
        fail(run, new Error('Unknown company'));
        return view(run);
      }
      if (key !== 'uber' || typeof login !== 'function') {
        run.settled = true;
        run.running = false;
        run.step = 'unavailable';
        run.message = 'Sign-in for this company is not connected yet.';
        return view(run);
      }
      login({
        report(step, message, channel) {
          if (run.settled) return;
          run.step = step;
          run.message = message;
          run.needsCode = step === 'code';
          run.channel = step === 'code' || step === 'filling' ? channel || '' : '';
          run.error = '';
          if (step === 'saved') {
            run.settled = true;
            run.running = false;
          }
        },
        readCode() {
          return new Promise((resolve, reject) => {
            run.needsCode = true;
            run.resolveCode = resolve;
            run.rejectCode = reject;
          });
        },
      }).catch((err) => fail(run, err));
      return view(run);
    },
    submitCode(key, raw) {
      const run = runs.get(key);
      if (!run || run.needsCode !== true || typeof run.resolveCode !== 'function') {
        return { ok: false, error: 'Not waiting for a code' };
      }
      const channel = run.channel;
      let picked = '';
      if (typeof raw === 'string') picked = raw;
      else if (raw && typeof raw === 'object') {
        if (channel === 'whatsapp') picked = raw.whatsappCode || '';
        else if (channel === 'email') picked = raw.emailCode || '';
        else picked = raw.code || raw.emailCode || raw.whatsappCode || '';
      }
      const code = String(picked || '').replace(/\s/g, '');
      const missing = channel === 'whatsapp' ? 'Enter the WhatsApp code' : channel === 'email' ? 'Enter the email code' : 'Enter the verification code';
      if (!/^\d{4,8}$/.test(code)) return { ok: false, error: missing };
      run.needsCode = false;
      run.step = 'filling';
      run.message = 'Filling the code into Uber.';
      const resolve = run.resolveCode;
      run.resolveCode = null;
      run.rejectCode = null;
      resolve(code);
      return { ok: true, run: view(run) };
    },
  };
}
