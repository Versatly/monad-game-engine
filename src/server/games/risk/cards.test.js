import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_TYPES,
  createTerritoryDeck,
  getTradeBonus,
  isValidTradeSet,
  pickBestTradeSet,
} from './cards.js';
import { TERRITORY_IDS } from './territories.js';

test('territory deck contains one card per territory plus two wilds', () => {
  const deck = createTerritoryDeck(TERRITORY_IDS, () => 0.5);
  assert.equal(deck.length, TERRITORY_IDS.length + 2);

  const territoryCards = deck.filter((card) => card.territoryId !== null);
  const wildCards = deck.filter((card) => card.type === CARD_TYPES.WILD);

  assert.equal(territoryCards.length, TERRITORY_IDS.length);
  assert.equal(wildCards.length, 2);
});

test('trade bonus progression matches classic escalating sequence', () => {
  assert.equal(getTradeBonus(0), 4);
  assert.equal(getTradeBonus(1), 6);
  assert.equal(getTradeBonus(2), 8);
  assert.equal(getTradeBonus(3), 10);
  assert.equal(getTradeBonus(4), 12);
  assert.equal(getTradeBonus(5), 15);
  assert.equal(getTradeBonus(6), 20);
  assert.equal(getTradeBonus(7), 25);
});

test('valid trade sets: mixed, triples, and wild substitutions', () => {
  const infantry = { id: 'i', type: CARD_TYPES.INFANTRY };
  const cavalry = { id: 'c', type: CARD_TYPES.CAVALRY };
  const artillery = { id: 'a', type: CARD_TYPES.ARTILLERY };
  const wild = { id: 'w', type: CARD_TYPES.WILD };

  assert.equal(isValidTradeSet([infantry, cavalry, artillery]), true);
  assert.equal(isValidTradeSet([infantry, infantry, infantry]), true);
  assert.equal(isValidTradeSet([infantry, infantry, cavalry]), false);
  assert.equal(isValidTradeSet([infantry, cavalry, wild]), true);
  assert.equal(isValidTradeSet([wild, wild, wild]), true);
});

test('pickBestTradeSet prefers sets that preserve wild cards', () => {
  const hand = [
    { id: 'i1', type: CARD_TYPES.INFANTRY },
    { id: 'i2', type: CARD_TYPES.INFANTRY },
    { id: 'i3', type: CARD_TYPES.INFANTRY },
    { id: 'w1', type: CARD_TYPES.WILD },
  ];
  const best = pickBestTradeSet(hand);
  assert.ok(best);
  const wildCount = best.filter((card) => card.type === CARD_TYPES.WILD).length;
  assert.equal(wildCount, 0);
});
