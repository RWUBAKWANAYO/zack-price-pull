import { parseProducts } from './parseProducts.js';
import { unableToPull } from '../../sources.js';
import { withBrowser } from '../../session.js';
import { writeSessionState } from '../../sessionState.js';

const HOME = 'https://m.uber.com/go/home';

async function visible(locator) {
  if ((await locator.count()) === 0) return false;
  return locator.first().isVisible().catch(() => false);
}

function skipControl(page) {
  return page.getByRole('button', { name: /^skip$/i }).or(page.getByText(/^skip$/i));
}

async function clickSkipIfAsked(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const skip = skipControl(page);
    if (!(await visible(skip))) return;
    await skip.first().click();
    await page.waitForTimeout(500);
  }
}

async function isLoginPage(page) {
  if (page.url().includes('auth.uber.com')) return true;
  const title = page.locator('#title');
  if (await visible(title)) {
    const text = await title.first().innerText();
    if (/phone number or email/i.test(text)) return true;
  }
  return visible(page.locator('#PHONE_NUMBER_or_EMAIL_ADDRESS'));
}

async function ensureLocationFields(page) {
  const pickup = page.locator('[data-testid="enhancer-container-pickup"]');
  if (await visible(pickup)) return;
  const openers = [
    page.locator('[placeholder*="Where to" i]'),
    page.getByRole('button', { name: /where to/i }),
    page.getByText(/^Where to\??$/i),
  ];
  for (const opener of openers) {
    if (await visible(opener)) {
      await opener.first().click();
      break;
    }
  }
  await pickup.first().waitFor({ state: 'visible', timeout: 20000 });
}

async function suggestionLocator(page) {
  const options = page.locator('[role="option"]:visible:not([data-testid="product_selector.list_item"])');
  try {
    await options.first().waitFor({ state: 'visible', timeout: 15000 });
    return options;
  } catch {
    const fallback = page.locator('[role="listbox"] li:visible, [data-testid*="suggestion"]:visible');
    await fallback.first().waitFor({ state: 'visible', timeout: 5000 });
    return fallback;
  }
}

async function choosePlace(page, testId, query) {
  const container = page.locator(`[data-testid="${testId}"]`);
  const input = container.locator('input[role="combobox"]');
  await container.first().waitFor({ state: 'visible', timeout: 20000 });
  await container.first().click();
  await input.first().focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(query, { delay: 40 });
  const options = await suggestionLocator(page);
  const count = await options.count();
  const needle = query.trim().toLowerCase();
  let index = 0;
  for (let i = 0; i < count; i += 1) {
    const text = (await options.nth(i).innerText()).toLowerCase();
    if (text.includes(needle)) {
      index = i;
      break;
    }
  }
  await options.nth(index).click();
  await page.waitForFunction(
    (id) => {
      const field = document.querySelector(`[data-testid="${id}"]`);
      if (!field) return false;
      return [...field.querySelectorAll('[value]')].some((node) => {
        return node.tagName !== 'INPUT' && node.getAttribute('value') && node.textContent.trim();
      });
    },
    testId,
    { timeout: 15000 }
  );
}

async function readRideList(page, pickup, dropoff) {
  await page.goto(HOME, { waitUntil: 'domcontentloaded' });
  await Promise.race([
    page.locator('#PHONE_NUMBER_or_EMAIL_ADDRESS').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    page.locator('[aria-label="Open profile menu"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
    page.locator('[data-testid="enhancer-container-pickup"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {}),
  ]);
  if (await isLoginPage(page)) {
    await writeSessionState('uber', 'expired');
    console.error('Uber session expired. Re-authenticate Uber from the price-pull sign-in page.');
    return unableToPull('uber');
  }
  try {
    await ensureLocationFields(page);
    await choosePlace(page, 'enhancer-container-pickup', pickup);
    await clickSkipIfAsked(page);
    await choosePlace(page, 'enhancer-container-drop0', dropoff);
    await clickSkipIfAsked(page);
    const search = page.getByRole('button', { name: /^search$/i });
    if (await visible(search)) {
      await search.click();
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await clickSkipIfAsked(page);
      const ready = await page.evaluate(() => {
        return [...document.querySelectorAll('[data-testid="product_selector.list_item"]')].some((item) =>
          /[£$€]\s*\d/.test(item.textContent || '')
        );
      });
      if (ready) break;
      await page.waitForTimeout(400);
    }
    const priced = await page.evaluate(() => {
      return [...document.querySelectorAll('[data-testid="product_selector.list_item"]')].some((item) =>
        /[£$€]\s*\d/.test(item.textContent || '')
      );
    });
    if (!priced) throw new Error('Timed out waiting for the ride list');
  } catch (err) {
    console.error(err.message);
    return unableToPull('uber');
  }
  const parsed = parseProducts(await page.content());
  if (!parsed.products.length) return unableToPull('uber');
  if (!parsed.pickup) parsed.pickup = pickup;
  if (!parsed.dropoff) parsed.dropoff = dropoff;
  return { source: 'uber', ...parsed };
}

export function pullUber({ pickup, dropoff }) {
  return withBrowser('uber', (page) => readRideList(page, pickup, dropoff));
}
