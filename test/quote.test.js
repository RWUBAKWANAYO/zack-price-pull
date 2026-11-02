import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteRoute } from '../src/quote.js';
import { sourceKey } from '../src/sources.js';

test('a source name matches the way Zack matches a competitor', () => {
  assert.equal(sourceKey('Uber'), 'uber');
  assert.equal(sourceKey('FREE NOW'), 'freenow');
  assert.equal(sourceKey(''), 'uber');
});

test('a source that is not connected is unable to pull data', async () => {
  const result = await quoteRoute({ source: 'Bolt', pickup: 'A', dropoff: 'B' });
  assert.equal(result.source, 'bolt');
  assert.deepEqual(result.products, []);
  assert.equal(result.error, 'Unable to pull data');
});
