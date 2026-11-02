import assert from 'node:assert/strict';
import test from 'node:test';
import { headless } from '../src/session.js';
import { askedChannel, codePrompt, codeRejected, rejectedPrompt } from '../src/sources/uber/login.js';

test('the Uber page names the code it is asking for', () => {
  assert.equal(askedChannel('EMAIL_OTP_CODE', 'Enter the 4-digit code'), 'email');
  assert.equal(askedChannel('WHATSAPP_OTP', 'Enter the code sent to a@b.com'), 'whatsapp');
  assert.equal(askedChannel('', 'Enter the 4-digit code sent via WhatsApp'), 'whatsapp');
  assert.equal(askedChannel('', 'Enter the 4-digit code sent to your email'), 'email');
  assert.equal(codePrompt('email'), 'Uber is asking for the email code.');
  assert.equal(codePrompt('whatsapp'), 'Uber is asking for the WhatsApp code.');
  assert.equal(rejectedPrompt('email'), 'Uber rejected that email code. Enter the email code again.');
  assert.equal(codeRejected('The code you entered is incorrect'), true);
  assert.equal(codeRejected('Enter the 4-digit code sent via WhatsApp'), false);
});

test('the browser stays on screen unless HEADLESS is true', () => {
  const mac = { platform: 'darwin' };
  const server = { platform: 'linux' };
  assert.equal(headless({}, mac), false);
  assert.equal(headless({ HEADLESS: 'false' }, mac), false);
  assert.equal(headless({ HEADLESS: 'true' }, mac), true);
  assert.equal(headless({ HEADLESS: '1' }, mac), true);
  assert.equal(headless({ HEADLESS: 'yes' }, mac), true);
  assert.equal(headless({ HEADLESS: 'on' }, mac), true);
  assert.equal(headless({ HEADLESS: 'false' }, server), true);
  assert.equal(headless({ DISPLAY: ':0', HEADLESS: 'false' }, server), false);
});
