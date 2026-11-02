import { parse } from 'node-html-parser';
import { UNABLE } from '../../sources.js';

const CURRENCY = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
  GBP: 'GBP',
  USD: 'USD',
  EUR: 'EUR',
};

const FARE = /^(£|\$|€|GBP|USD|EUR)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)$/;

function selectedPlace(root, testId) {
  const container = root.querySelector(`[data-testid="${testId}"]`);
  if (!container) return '';
  for (const node of container.querySelectorAll('[value]')) {
    const tag = String(node.rawTagName || node.tagName || '').toUpperCase();
    const value = String(node.getAttribute('value') || '').trim();
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (tag === 'INPUT' || !value || !text) continue;
    return text;
  }
  return '';
}

function firstText(element) {
  for (const node of element.childNodes) {
    if (node.nodeType !== 3) continue;
    const text = String(node.text || node.rawText || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function capacityOf(nameElement) {
  for (const span of nameElement.querySelectorAll('span')) {
    const text = span.text.replace(/\s+/g, ' ').trim();
    if (/^\d+$/.test(text)) return Number(text);
  }
  return null;
}

function etaOf(item) {
  const element = item.querySelector('[data-testid="product_selector.list_item.eta_string"]');
  if (!element) return { eta: '', available: true };
  const full = element.text.replace(/\s+/g, ' ').trim();
  const eta = full.split(/[•·]/)[0].trim();
  return { eta, available: !/unavailable/i.test(full) };
}

function fareOf(item) {
  const nodes = item.querySelectorAll('p, span, div');
  let found = null;
  for (const node of nodes) {
    const text = node.text.replace(/\s+/g, ' ').trim();
    const match = text.match(FARE);
    if (!match) continue;
    found = {
      currency: CURRENCY[match[1]] || '',
      fare: Number(match[2].replace(/,/g, '')),
    };
  }
  if (!found || !Number.isFinite(found.fare)) return null;
  return found;
}

export function parseProducts(html) {
  const root = parse(String(html || ''));
  const pickup = selectedPlace(root, 'enhancer-container-pickup');
  const dropoff = selectedPlace(root, 'enhancer-container-drop0');
  const products = [];
  let currency = '';

  for (const item of root.querySelectorAll('[data-testid="product_selector.list_item"]')) {
    const nameElement = item.querySelector('p');
    const priced = fareOf(item);
    if (!nameElement || !priced) continue;
    const name = firstText(nameElement);
    if (!name) continue;
    if (!currency && priced.currency) currency = priced.currency;
    const timing = etaOf(item);
    products.push({
      name,
      fare: priced.fare,
      productId: String(item.getAttribute('data-itemid') || ''),
      capacity: capacityOf(nameElement),
      eta: timing.eta,
      available: timing.available,
    });
  }

  if (!products.length) {
    return { currency, pickup, dropoff, products, error: UNABLE };
  }

  return { currency, pickup, dropoff, products };
}
