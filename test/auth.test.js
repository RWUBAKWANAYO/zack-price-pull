import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuth } from '../src/auth.js';
import { routeRequest } from '../src/server.js';
import { COMPANIES } from '../src/sources.js';

function authWith(login) {
  return createAuth({
    companies: COMPANIES,
    login,
    readState: async () => 'none',
  });
}

test('the sign-in page lists Uber, Bolt, and inDrive', async () => {
  const auth = authWith(async () => {});
  const rows = await auth.list();
  assert.deepEqual(rows.map((row) => row.name), ['Uber', 'Bolt', 'inDrive']);
  assert.deepEqual(rows.map((row) => row.session), ['none', 'none', 'none']);
});

test('Bolt re-authenticate does not open a browser', async () => {
  let called = false;
  const auth = authWith(async () => {
    called = true;
  });
  const started = auth.start('bolt');
  assert.equal(called, false);
  assert.equal(started.step, 'unavailable');
  assert.equal(started.running, false);
});

test('an Uber code is handed to the browser once and is not stored on the status', async () => {
  let received = '';
  const auth = authWith(async (hooks) => {
    hooks.report('email', 'Email entered. Waiting for the verification code.');
    hooks.report('code', 'Enter the verification code Uber sent.');
    received = await hooks.readCode();
    hooks.report('saved', 'Uber session saved.');
  });
  const started = auth.start('uber');
  assert.equal(started.running, true);
  await new Promise((resolve) => setImmediate(resolve));
  const waiting = (await auth.list()).find((row) => row.key === 'uber');
  assert.equal(waiting.run.needsCode, true);
  assert.equal(JSON.stringify(waiting).includes('123456'), false);
  const submitted = auth.submitCode('uber', '123 456');
  assert.equal(submitted.ok, true);
  assert.equal(submitted.run.step, 'filling');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received, '123456');
  const saved = (await auth.list()).find((row) => row.key === 'uber');
  assert.equal(saved.run.step, 'saved');
  assert.equal(saved.run.running, false);
  assert.equal(JSON.stringify(saved).includes('123456'), false);
  assert.equal(auth.submitCode('uber', '123456').ok, false);
});

test('each code is taken from the channel Uber is asking for and is not stored', async () => {
  const received = [];
  const auth = authWith(async (hooks) => {
    hooks.report('code', 'Uber is asking for the email code.', 'email');
    received.push(await hooks.readCode());
    hooks.report('code', 'Uber is asking for the WhatsApp code.', 'whatsapp');
    received.push(await hooks.readCode());
    hooks.report('saved', 'Uber session saved.');
  });
  auth.start('uber');
  await new Promise((resolve) => setImmediate(resolve));
  const emailAsk = (await auth.list()).find((row) => row.key === 'uber');
  assert.equal(emailAsk.run.channel, 'email');
  const first = auth.submitCode('uber', { emailCode: '111111', whatsappCode: '222222' });
  assert.equal(first.ok, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received[0], '111111');
  const whatsappAsk = (await auth.list()).find((row) => row.key === 'uber');
  assert.equal(whatsappAsk.run.channel, 'whatsapp');
  const second = auth.submitCode('uber', { emailCode: '111111', whatsappCode: '222222' });
  assert.equal(second.ok, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received[1], '222222');
  const saved = (await auth.list()).find((row) => row.key === 'uber');
  const status = JSON.stringify(saved);
  assert.equal(status.includes('111111'), false);
  assert.equal(status.includes('222222'), false);
  assert.equal(saved.run.step, 'saved');
});

test('the sign-in page is served and a quote still has its route', async () => {
  const auth = authWith(async () => {});
  const home = await routeRequest({
    method: 'GET',
    url: '/',
    body: '',
    auth,
    quote: async () => ({ source: 'uber', products: [] }),
    home: '<h1>Price pull sign-in</h1>',
  });
  assert.equal(home.status, 200);
  assert.match(home.body, /Price pull sign-in/);
  const quoted = await routeRequest({
    method: 'POST',
    url: '/quote',
    body: JSON.stringify({ source: 'Uber', pickup: 'A', dropoff: 'B' }),
    auth,
    quote: async (body) => ({ source: body.source, pickup: body.pickup }),
    home: '',
  });
  assert.equal(quoted.status, 200);
  assert.deepEqual(JSON.parse(quoted.body), { source: 'Uber', pickup: 'A' });
});
