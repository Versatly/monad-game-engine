import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRITORIES,
  TERRITORY_IDS,
  CONTINENT_BONUSES,
  CONTINENT_TERRITORIES,
  validateTerritoryGraph,
} from './territories.js';

test('Risk territory graph has 42 territories and valid adjacency', () => {
  assert.equal(TERRITORY_IDS.length, 42);
  assert.deepEqual(validateTerritoryGraph(), []);
});

test('Classic continent territory counts match official Risk board', () => {
  assert.equal(CONTINENT_TERRITORIES.north_america.length, 9);
  assert.equal(CONTINENT_TERRITORIES.south_america.length, 4);
  assert.equal(CONTINENT_TERRITORIES.europe.length, 7);
  assert.equal(CONTINENT_TERRITORIES.africa.length, 6);
  assert.equal(CONTINENT_TERRITORIES.asia.length, 12);
  assert.equal(CONTINENT_TERRITORIES.australia.length, 4);
});

test('Classic continent bonus values are correct', () => {
  assert.deepEqual(CONTINENT_BONUSES, {
    asia: 7,
    north_america: 5,
    europe: 5,
    africa: 3,
    south_america: 2,
    australia: 2,
  });
});

test('Cross-continent bridge adjacencies exist', () => {
  assert.ok(TERRITORIES.alaska.adjacent.includes('kamchatka'));
  assert.ok(TERRITORIES.brazil.adjacent.includes('north_africa'));
  assert.ok(TERRITORIES.iceland.adjacent.includes('greenland'));
  assert.ok(TERRITORIES.siam.adjacent.includes('indonesia'));
});
