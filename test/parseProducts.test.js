import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseProducts } from '../src/sources/uber/parseProducts.js';

const fixture = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ride-list.html'),
  'utf8'
);

test('parses priced rows and an unavailable row', () => {
  const result = parseProducts(fixture);
  assert.equal(result.currency, 'GBP');
  assert.equal(result.pickup, 'London Luton Airport');
  assert.equal(result.dropoff, 'LGW - Gatwick Airport');
  assert.equal(result.error, undefined);
  assert.deepEqual(result.products, [
    {
      name: 'UberX',
      fare: 70.94,
      productId: '285',
      capacity: 4,
      eta: '4 mins away',
      available: true,
    },
    {
      name: 'Comfort',
      fare: 77.99,
      productId: '20024451',
      capacity: 4,
      eta: '5 mins away',
      available: true,
    },
    {
      name: 'Exec',
      fare: 104.98,
      productId: '496',
      capacity: 4,
      eta: 'Unavailable',
      available: false,
    },
  ]);
});

test('an encoded ampersand in a product name is stored as text', () => {
  const result = parseProducts(
    '<li data-testid="product_selector.list_item" data-itemid="1"><p>Wait &amp; Save<span>4</span></p><p>£22.91</p></li>'
  );
  assert.equal(result.products[0].name, 'Wait & Save');
  assert.equal(result.products[0].fare, 22.91);
});

test('an empty list is unable to pull data', () => {
  const result = parseProducts('<main></main>');
  assert.deepEqual(result.products, []);
  assert.equal(result.error, 'Unable to pull data');
});
