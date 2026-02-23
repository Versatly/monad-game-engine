import { CONTINENT_TERRITORIES } from './territories.js';

export const RISK_AI_PROFILES = {
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive Bot',
    color: '#e74c3c',
    minAttackAdvantage: -1,
    attackBias: 1.3,
    continentBias: 0.2,
  },
  defensive: {
    id: 'defensive',
    name: 'Defensive Bot',
    color: '#3498db',
    minAttackAdvantage: 2,
    attackBias: 0.8,
    continentBias: 1.4,
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Bot',
    color: '#2ecc71',
    minAttackAdvantage: 1,
    attackBias: 1.0,
    continentBias: 1.0,
  },
};

function getProfile(profileId) {
  return RISK_AI_PROFILES[profileId] || RISK_AI_PROFILES.balanced;
}

function getContinentFocusScore(game, playerId, continentId) {
  const ids = CONTINENT_TERRITORIES[continentId] || [];
  if (ids.length === 0) return 0;
  let owned = 0;
  for (const id of ids) {
    const territory = game.territories.get(id);
    if (territory?.ownerId === playerId) owned++;
  }
  return owned / ids.length;
}

function territoryPressure(game, territoryId, ownerId) {
  const territory = game.territories.get(territoryId);
  if (!territory) return 0;

  let enemyTroops = 0;
  let enemyBorders = 0;
  for (const adjacentId of territory.adjacent) {
    const adjacent = game.territories.get(adjacentId);
    if (!adjacent || adjacent.ownerId === ownerId) continue;
    enemyTroops += adjacent.troops;
    enemyBorders++;
  }

  if (enemyBorders === 0) return -2;
  return enemyTroops / enemyBorders;
}

export function chooseReinforcement(game, playerId, profileId, maxTroops = 1) {
  const profile = getProfile(profileId);
  const owned = game.getOwnedTerritories(playerId);
  if (owned.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const territory of owned) {
    const pressure = territoryPressure(game, territory.id, playerId);
    const troops = territory.troops;
    const continentRatio = getContinentFocusScore(game, playerId, territory.continent);
    const borderEnemies = game.getEnemyNeighbors(territory.id, playerId).length;

    // Higher pressure + better continent ownership + more attack lanes.
    const score = (
      pressure * 1.5 +
      continentRatio * profile.continentBias +
      borderEnemies * 0.45 +
      (profile.attackBias * Math.max(0, troops - 1)) * 0.15
    );

    if (score > bestScore) {
      bestScore = score;
      best = territory;
    }
  }

  if (!best) return null;
  return {
    territoryId: best.id,
    troops: Math.max(1, Math.floor(maxTroops)),
  };
}

export function chooseAttack(game, playerId, profileId) {
  const profile = getProfile(profileId);
  const owned = game.getOwnedTerritories(playerId);

  let best = null;
  let bestScore = -Infinity;

  for (const from of owned) {
    if (from.troops < 2) continue;

    const enemies = game.getEnemyNeighbors(from.id, playerId);
    for (const to of enemies) {
      const advantage = from.troops - to.troops;
      if (advantage < profile.minAttackAdvantage) continue;

      const continentPush = getContinentFocusScore(game, playerId, to.continent);
      const toBorders = game.getEnemyNeighbors(to.id, to.ownerId).length;

      const score = (
        advantage * profile.attackBias +
        continentPush * profile.continentBias +
        toBorders * 0.35
      );

      if (score > bestScore) {
        bestScore = score;
        best = { from, to };
      }
    }
  }

  if (!best) return null;
  const dice = Math.min(3, Math.max(1, best.from.troops - 1));
  return {
    fromId: best.from.id,
    toId: best.to.id,
    dice,
  };
}

export function chooseFortify(game, playerId, profileId) {
  const profile = getProfile(profileId);
  const owned = game.getOwnedTerritories(playerId);
  if (owned.length < 2) return null;

  // Source: interior territory with lots of troops and low pressure.
  let source = null;
  let sourceScore = -Infinity;
  for (const territory of owned) {
    if (territory.troops < 2) continue;
    const pressure = territoryPressure(game, territory.id, playerId);
    const score = territory.troops - pressure;
    if (score > sourceScore) {
      sourceScore = score;
      source = territory;
    }
  }
  if (!source) return null;

  const connected = game.getConnectedOwnedTerritories(source.id, playerId);
  connected.delete(source.id);
  if (connected.size === 0) return null;

  let target = null;
  let targetScore = -Infinity;
  for (const territoryId of connected) {
    const territory = game.territories.get(territoryId);
    if (!territory) continue;

    const pressure = territoryPressure(game, territoryId, playerId);
    const continentRatio = getContinentFocusScore(game, playerId, territory.continent);
    const score = pressure * 1.4 + continentRatio * profile.continentBias;
    if (score > targetScore) {
      targetScore = score;
      target = territory;
    }
  }

  if (!target) return null;
  const transferable = source.troops - 1;
  if (transferable <= 0) return null;

  const troops = Math.max(1, Math.floor(transferable * 0.5));
  return {
    fromId: source.id,
    toId: target.id,
    troops,
  };
}
