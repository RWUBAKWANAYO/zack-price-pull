import { withBrowser } from '../../session.js';
import { writeSessionState } from '../../sessionState.js';

const HOME = 'https://m.uber.com/go/home';
const LOGIN = `https://auth.uber.com/v2/?next_url=${encodeURIComponent(HOME)}`;
const LOGIN_WAIT_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function visible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function loginScreen(page) {
  if (String(page.url() || '').includes('auth.uber.com')) return true;
  if (await visible(page.locator('#PHONE_NUMBER_or_EMAIL_ADDRESS'))) return true;
  if (await visible(page.locator('#alt-action-help-v2, #alt-action-send-via-whatsapp'))) return true;
  return false;
}

async function signedIn(page) {
  if (await loginScreen(page)) return false;
  return visible(page.locator('[aria-label="Open profile menu"]'));
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 2000 }).catch(() => '');
}

export function askedChannel(screenTest, text) {
  const screen = String(screenTest || '');
  const body = String(text || '');
  if (/whatsapp/i.test(screen)) return 'whatsapp';
  if (/email/i.test(screen)) return 'email';
  if (/sms/i.test(screen)) return 'sms';
  if (/whatsapp/i.test(body)) return 'whatsapp';
  if (/via email|by email|to your email|email code|sent to your email/i.test(body)) return 'email';
  if (/\bsms\b/i.test(body)) return 'sms';
  return '';
}

export function codeRejected(text) {
  return /incorrect|not valid|invalid code|expired|try again|doesn.?t match|didn.?t match|wrong code|code you entered|couldn.?t verify|unable to verify/i.test(
    String(text || ''),
  );
}

export function codePrompt(channel) {
  if (channel === 'whatsapp') return 'Uber is asking for the WhatsApp code.';
  if (channel === 'email') return 'Uber is asking for the email code.';
  if (channel === 'sms') return 'Uber is asking for the SMS code.';
  return 'Uber is asking for a verification code.';
}

export function rejectedPrompt(channel) {
  if (channel === 'whatsapp') return 'Uber rejected that WhatsApp code. Enter the WhatsApp code again.';
  if (channel === 'email') return 'Uber rejected that email code. Enter the email code again.';
  if (channel === 'sms') return 'Uber rejected that SMS code. Enter the SMS code again.';
  return 'Uber rejected that code. Enter the verification code again.';
}

let emailChoiceSent = false;

async function chooseEmailCode(page) {
  const email = page.locator('#alt-more-options-modal-email');
  const modal = page.locator('[data-baseweb="modal"]');
  if (emailChoiceSent) return false;
  if (!(await visible(modal)) && !(await visible(email))) {
    const more = page.locator('#alt-action-help-v2');
    if (!(await visible(more))) return false;
    await more.click({ timeout: 8000 });
  }
  const ready = await email.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
  if (!ready) return false;
  await sleep(1000);
  await email.click({ timeout: 8000 });
  const gone = await email.waitFor({ state: 'hidden', timeout: 15000 }).then(() => true).catch(() => false);
  if (!gone) return false;
  emailChoiceSent = true;
  return true;
}

async function waitForSession(page) {
  const context = page.context();
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    const current = context.pages().filter((item) => !item.isClosed()).at(-1);
    if (!current) {
      await sleep(500);
      continue;
    }
    if (await signedIn(current)) return;
    await chooseEmailCode(current).catch(() => {});
    await sleep(1000);
  }
  throw new Error('Login timed out before the ride home appeared.');
}

async function submitEmail(page, email) {
  const field = page.locator('#PHONE_NUMBER_or_EMAIL_ADDRESS');
  if (!(await visible(field))) return false;
  await field.fill(email);
  await page.locator('#forward-button').click();
  return true;
}

async function latestPage(page) {
  const current = page.context().pages().filter((item) => !item.isClosed()).at(-1);
  return current || page;
}

async function codeInputs(page) {
  const locator = page.locator('input:visible');
  const count = await locator.count();
  const found = [];
  for (let index = 0; index < count; index += 1) {
    const input = locator.nth(index);
    const type = (await input.getAttribute('type')) || '';
    if (type === 'hidden' || type === 'email' || type === 'password') continue;
    const id = (await input.getAttribute('id')) || '';
    const name = (await input.getAttribute('name')) || '';
    const auto = (await input.getAttribute('autocomplete')) || '';
    const mode = (await input.getAttribute('inputmode')) || '';
    const max = await input.getAttribute('maxlength');
    if (/otp|code|pin/i.test(`${id} ${name} ${auto}`) || mode === 'numeric' || max === '1') found.push(input);
  }
  return found;
}

async function screenName(page) {
  return page.locator('[screen-test]').first().getAttribute('screen-test').catch(() => '');
}

async function fillCode(page, code) {
  const digits = String(code || '').replace(/\s/g, '');
  let current = await latestPage(page);
  const inputs = await codeInputs(current);
  if (inputs.length > 1) {
    for (let index = 0; index < inputs.length && index < digits.length; index += 1) {
      await inputs[index].fill(digits[index]);
    }
  } else if (inputs.length === 1) {
    await inputs[0].fill(digits);
  } else {
    await current.keyboard.type(digits, { delay: 40 });
  }
}

async function saved(report, message) {
  await writeSessionState('uber', 'signed-in');
  if (report) report('saved', message);
}

async function openLogin(page, email) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await loginScreen(page)) break;
    if (await signedIn(page)) {
      await sleep(1000);
      if (await loginScreen(page)) break;
      if (await signedIn(page)) return 'signed-in';
    }
    await sleep(300);
  }
  await writeSessionState('uber', 'expired');
  if (await submitEmail(page, email)) return 'email';
  const text = await bodyText(page);
  const onAuth =
    page.url().includes('auth.uber.com') ||
    /send us an sms|verification code|enter the \d-digit code|welcome back|more options|whatsapp/i.test(text);
  if (!onAuth) {
    await page.goto(LOGIN, { waitUntil: 'domcontentloaded' });
    await submitEmail(page, email);
  }
  return 'email';
}

async function readAsk(page) {
  const inputs = await codeInputs(page);
  const screen = await screenName(page);
  const title = (await page.locator('#title').count()) ? await page.locator('#title').innerText({ timeout: 300 }).catch(() => '') : '';
  const subtitle = (await page.locator('#subtitle').count()) ? await page.locator('#subtitle').innerText({ timeout: 300 }).catch(() => '') : '';
  const text = inputs.length ? await bodyText(page) : '';
  const fieldError = (await page.locator('#field-error').count())
    ? await page.locator('#field-error').innerText({ timeout: 300 }).catch(() => '')
    : '';
  const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
  const invalid = await page.locator('input[aria-invalid="true"]:visible').count().catch(() => 0);
  const heading = `${title}\n${subtitle}`;
  const combined = [heading, text, fieldError, ...alerts].join('\n');
  let channel = '';
  if (inputs.length) {
    channel = askedChannel(screen, heading);
    if (!channel) channel = askedChannel('', heading || text);
  }
  return {
    inputs,
    screen,
    channel,
    rejected: codeRejected(combined) || invalid > 0,
  };
}

function movedOn(ask, channel, screen) {
  if (!ask.inputs.length) return false;
  if (screen && ask.screen && ask.screen !== screen) return true;
  return Boolean(channel && ask.channel && ask.channel !== channel);
}

function rideHome(page) {
  const url = String(page.url() || '');
  return url.includes('m.uber.com') && /\/go\/home/i.test(url) && !url.includes('auth.uber.com');
}

async function clickEnabledForward(page) {
  const forward = page.locator('#forward-button');
  const enabled = (await visible(forward)) && (await forward.isEnabled({ timeout: 500 }).catch(() => false));
  if (!enabled) return false;
  await forward.click({ timeout: 3000, noWaitAfter: true }).catch(() => {});
  return true;
}

async function waitForVerdict(page, channel, screen) {
  const deadline = Date.now() + 25000;
  let clicked = false;
  while (Date.now() < deadline) {
    const current = await latestPage(page);
    if (rideHome(current) || (await signedIn(current))) return { status: 'signed-in', channel };
    const ask = await readAsk(current);
    if (ask.inputs.length) {
      if (movedOn(ask, channel, screen)) return { status: 'next', channel: ask.channel };
      if (ask.rejected) return { status: 'rejected', channel: ask.channel || channel };
      if (!clicked) clicked = await clickEnabledForward(current);
    }
    await sleep(300);
  }
  const current = await latestPage(page);
  if (rideHome(current) || (await signedIn(current))) return { status: 'signed-in', channel };
  const ask = await readAsk(current);
  if (ask.inputs.length && ask.rejected) return { status: 'rejected', channel: ask.channel || channel };
  if (movedOn(ask, channel, screen)) return { status: 'next', channel: ask.channel || channel };
  return { status: 'unconfirmed', channel: ask.channel || channel };
}

function fillingMessage(channel) {
  if (channel === 'whatsapp') return 'WhatsApp code entered. Sign-in stays open until Uber stops asking for a code.';
  if (channel === 'email') return 'Email code entered. Sign-in stays open if Uber asks for the WhatsApp code.';
  return 'Code entered. Sign-in stays open until Uber stops asking for a code.';
}

async function finishWithCode(page, hooks) {
  const report = hooks.report;
  const deadline = Date.now() + LOGIN_WAIT_MS;
  while (Date.now() < deadline) {
    const current = await latestPage(page);
    if (rideHome(current) || (await signedIn(current))) {
      await saved(report, 'Uber session saved.');
      return;
    }
    const ask = await readAsk(current);
    if (!ask.inputs.length && (await chooseEmailCode(current))) {
      report('waiting', 'Choosing email. Uber can still ask for an email code and a WhatsApp code.');
      await sleep(1000);
      continue;
    }
    if (ask.inputs.length) {
      const channel = ask.channel;
      report('code', ask.rejected ? rejectedPrompt(channel) : codePrompt(channel), channel);
      const code = await hooks.readCode();
      report('filling', fillingMessage(channel), channel);
      await fillCode(current, code);
      const verdict = await waitForVerdict(page, channel, ask.screen);
      if (verdict.status === 'signed-in') {
        await saved(report, 'Uber session saved.');
        return;
      }
      if (verdict.status === 'next') {
        report('waiting', codePrompt(verdict.channel), verdict.channel);
      }
      continue;
    }
    report('waiting', 'Waiting for Uber to ask for a verification code.');
    await sleep(1000);
  }
  throw new Error('Login timed out before the ride home appeared.');
}

export async function loginUber(hooks = {}) {
  const email = String(process.env.UBER_EMAIL || '').trim();
  if (!email) {
    throw new Error('Set UBER_EMAIL in .env');
  }
  const report = hooks.report;

  emailChoiceSent = false;
  await withBrowser('uber', async (page) => {
    const extras = page.context().pages().filter((item) => item !== page);
    await Promise.all(extras.map((item) => item.close().catch(() => {})));
    if (report) report('opening', 'Opening Uber.');
    const opened = await openLogin(page, email);
    if (opened === 'signed-in') {
      const message = 'Uber is already signed in. The session is saved.';
      await saved(report, message);
      if (!report) console.log(message);
      return;
    }
    if (!hooks.readCode) {
      console.log('Enter the verification code in the browser window. Complete any security check there.');
      await waitForSession(page);
      await saved(null, '');
      console.log('Uber session saved.');
      return;
    }
    if (report) report('email', 'Email entered. Waiting for the verification code.');
    await finishWithCode(page, hooks);
  });
}
