import { randomUUID } from 'crypto';

export const CARD_TYPES = {
  INFANTRY: 'infantry',
  CAVALRY: 'cavalry',
  ARTILLERY: 'artillery',
  WILD: 'wild',
};

const TERRITORY_CARD_ROTATION = [
  CARD_TYPES.INFANTRY,
  CARD_TYPES.CAVALRY,
  CARD_TYPES.ARTILLERY,
];

const BASE_TRADE_BONUSES = [4, 6, 8, 10, 12, 15];

export function getTradeBonus(tradeCount) {
  if (tradeCount < BASE_TRADE_BONUSES.length) {
    return BASE_TRADE_BONUSES[tradeCount];
  }
  return 15 + (tradeCount - (BASE_TRADE_BONUSES.length - 1)) * 5;
}

export function shuffleInPlace(list, rng = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function createTerritoryDeck(territoryIds, rng = Math.random) {
  const cards = territoryIds.map((territoryId, index) => ({
    id: `risk-card-${randomUUID().slice(0, 10)}`,
    territoryId,
    type: TERRITORY_CARD_ROTATION[index % TERRITORY_CARD_ROTATION.length],
  }));

  cards.push(
    { id: `risk-card-${randomUUID().slice(0, 10)}`, territoryId: null, type: CARD_TYPES.WILD },
    { id: `risk-card-${randomUUID().slice(0, 10)}`, territoryId: null, type: CARD_TYPES.WILD },
  );

  return shuffleInPlace(cards, rng);
}

export function drawCard(deck, discardPile, rng = Math.random) {
  if (deck.length === 0 && discardPile.length > 0) {
    deck.push(...discardPile.splice(0));
    shuffleInPlace(deck, rng);
  }
  return deck.pop() || null;
}

export function isValidTradeSet(cards) {
  if (!Array.isArray(cards) || cards.length !== 3) return false;

  const wildCount = cards.filter((card) => card.type === CARD_TYPES.WILD).length;
  const nonWildTypes = cards
    .filter((card) => card.type !== CARD_TYPES.WILD)
    .map((card) => card.type);

  if (nonWildTypes.length === 0) return true; // three wilds

  const allSame = nonWildTypes.every((type) => type === nonWildTypes[0]);
  if (allSame) return true; // e.g. infantry+wild+wild

  const unique = new Set(nonWildTypes);
  if (unique.size !== nonWildTypes.length) return false; // duplicates cannot form mixed set

  const validBaseTypes = new Set([
    CARD_TYPES.INFANTRY,
    CARD_TYPES.CAVALRY,
    CARD_TYPES.ARTILLERY,
  ]);
  for (const type of unique) {
    if (!validBaseTypes.has(type)) return false;
  }

  // Mixed set (one of each) can be completed with wilds.
  const missingForMixed = 3 - unique.size;
  return missingForMixed <= wildCount;
}

export function findValidTradeSets(hand) {
  const validSets = [];
  if (!Array.isArray(hand) || hand.length < 3) return validSets;

  for (let i = 0; i < hand.length - 2; i++) {
    for (let j = i + 1; j < hand.length - 1; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const set = [hand[i], hand[j], hand[k]];
        if (isValidTradeSet(set)) {
          validSets.push(set);
        }
      }
    }
  }

  return validSets;
}

export function pickBestTradeSet(hand) {
  const validSets = findValidTradeSets(hand);
  if (validSets.length === 0) return null;

  // Prefer preserving wilds for future forced trades.
  validSets.sort((a, b) => {
    const wildA = a.filter((card) => card.type === CARD_TYPES.WILD).length;
    const wildB = b.filter((card) => card.type === CARD_TYPES.WILD).length;
    if (wildA !== wildB) return wildA - wildB;

    // Tie-breaker: prefer mixed sets over triples (keeps flexibility).
    const uniqueA = new Set(a.map((card) => card.type)).size;
    const uniqueB = new Set(b.map((card) => card.type)).size;
    return uniqueB - uniqueA;
  });

  return validSets[0];
}

export function removeCardsFromHand(hand, selectedCardIds) {
  const selected = new Set(selectedCardIds || []);
  const removed = [];
  const remaining = [];

  for (const card of hand) {
    if (selected.has(card.id)) removed.push(card);
    else remaining.push(card);
  }

  return { removed, remaining };
}
