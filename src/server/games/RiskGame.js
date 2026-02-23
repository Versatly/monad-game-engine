/**
 * RiskGame - Classic Risk implementation as a MiniGame.
 *
 * Rules implemented:
 * - 42 territories / 6 continents / classic adjacency
 * - 2-6 players
 * - Initial random territory assignment + initial troop placement
 * - Turn phases: reinforce -> attack -> fortify
 * - Dice combat (attacker up to 3, defender up to 2)
 * - Territory cards with escalating trade-in bonus
 * - Continent bonuses
 * - Elimination / card transfer
 * - Win condition: control all territories
 */

import { randomUUID } from 'crypto';
import { MiniGame } from '../MiniGame.js';
import {
  CONTINENTS,
  CONTINENT_BONUSES,
  TERRITORIES,
  TERRITORY_IDS,
  CONTINENT_TERRITORIES,
} from './risk/territories.js';
import { resolveCombat } from './risk/combat.js';
import {
  createTerritoryDeck,
  drawCard,
  getTradeBonus,
  isValidTradeSet,
  pickBestTradeSet,
  removeCardsFromHand,
} from './risk/cards.js';
import {
  RISK_AI_PROFILES,
  chooseAttack,
  chooseFortify,
  chooseReinforcement,
} from './risk/aiStrategies.js';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];

const AI_ORDER = ['aggressive', 'defensive', 'balanced'];
const INITIAL_TROOPS = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

const BOARD_Y = 0.9;
const TERRITORY_SIZE = [4.4, 0.9, 3.2];
const LABEL_Y_OFFSET = 1.4;

const DEFAULT_TIME_LIMIT = 4 * 60 * 60 * 1000; // 4 hours
const HUMAN_ACTION_TIMEOUT_MS = 35000;
const AI_ACTION_DELAY_MS = 950;
const DICE_VISUAL_MS = 1400;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function randomInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function getInitialTroopsForPlayerCount(playerCount) {
  return INITIAL_TROOPS[playerCount] || 20;
}

function formatCardSummary(cards) {
  const counts = { infantry: 0, cavalry: 0, artillery: 0, wild: 0 };
  for (const card of cards) counts[card.type] = (counts[card.type] || 0) + 1;
  return counts;
}

export class RiskGame extends MiniGame {
  constructor(worldState, broadcastFn, config = {}) {
    super(worldState, broadcastFn, {
      ...config,
      type: 'risk',
      timeLimit: config.timeLimit || DEFAULT_TIME_LIMIT,
    });

    this.maxPlayers = 6;
    this.minPlayers = 2;

    this.riskPlayers = new Map(); // playerId -> Risk player metadata
    this.playerOrder = [];
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;

    this.phase = 'setup'; // setup -> initial_placement -> reinforce -> attack -> fortify
    this.reinforcementPool = 0;
    this.initialTroopsRemaining = new Map();
    this.conqueredThisTurn = false;
    this.hasFortifiedThisTurn = false;

    this.territories = new Map(); // territoryId -> state
    this.deck = [];
    this.discardPile = [];
    this.tradeCount = 0;

    this.turnActionAt = Date.now();
    this.nextAiActionAt = Date.now();

    this.territoryEntities = new Map(); // territoryId -> { territoryEntityId, labelEntityId }
    this._botCounter = 0;
  }

  start() {
    super.start();

    this._initializeRiskPlayers();
    this._initializeTerritories();
    this._spawnBoardEntities();

    this.phase = 'initial_placement';
    this.currentPlayerIndex = randomInt(this.playerOrder.length);
    this.turnNumber = 1;
    this.turnActionAt = Date.now();
    this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;

    this.announce(
      `RISK STARTED! ${this.playerOrder.length} players. Initial placement begins.`,
      'challenge',
    );
    this._syncGameStateSummary();
    this._broadcastRiskState('game_started');
    return this;
  }

  update() {
    if (!this.isActive) return;
    if (this.worldState.gameState.phase === 'countdown') return;

    const now = Date.now();
    if (now - this.startTime >= this.timeLimit) {
      const leader = this._getLeaderByTerritories();
      this.end('timeout', leader?.id || null);
      return;
    }

    this._forfeitDisconnectedHumans();

    const winner = this._getWinnerId();
    if (winner) {
      this.end('win', winner);
      return;
    }

    const activePlayerId = this.getActivePlayerId();
    if (!activePlayerId) {
      this.end('draw');
      return;
    }

    const active = this.riskPlayers.get(activePlayerId);
    if (!active || active.eliminated) {
      this._advanceToNextAlivePlayer();
      this._startTurnForCurrentPlayer();
      return;
    }

    if (active.isBot) {
      if (now >= this.nextAiActionAt) {
        this._performAiStep(activePlayerId);
      }
      return;
    }

    if (now - this.turnActionAt > HUMAN_ACTION_TIMEOUT_MS) {
      this._performTimedAutoAction(activePlayerId);
    }
  }

  handlePlayerAction(playerId, action = {}) {
    if (!this.isActive) return { ok: false, error: 'Risk game is not active' };
    if (this.worldState.gameState.phase === 'countdown') {
      return { ok: false, error: 'Risk game is in countdown' };
    }

    const participant = this.riskPlayers.get(playerId);
    if (!participant || participant.eliminated) {
      return { ok: false, error: 'You are not an active Risk participant' };
    }

    const activePlayerId = this.getActivePlayerId();
    if (activePlayerId !== playerId) {
      return {
        ok: false,
        error: `Not your turn. Active player: ${this.riskPlayers.get(activePlayerId)?.name || activePlayerId}`,
      };
    }

    const type = action.type;
    let result = null;
    switch (this.phase) {
      case 'initial_placement':
        result = this._handleInitialPlacementAction(playerId, action);
        break;
      case 'reinforce':
        result = this._handleReinforceAction(playerId, action);
        break;
      case 'attack':
        result = this._handleAttackAction(playerId, action);
        break;
      case 'fortify':
        result = this._handleFortifyAction(playerId, action);
        break;
      default:
        result = { ok: false, error: `Unsupported Risk phase: ${this.phase}` };
    }

    if (result?.ok) {
      this.turnActionAt = Date.now();
      this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
      this._syncGameStateSummary();
      this._broadcastRiskState(type || 'action');
    }
    return result;
  }

  _initializeRiskPlayers() {
    const candidates = [];
    for (const [id, p] of this.worldState.players) {
      if (p.type === 'spectator') continue;
      if (p.state === 'spectating') continue;
      candidates.push({ id, name: p.name, isBot: false, strategy: null });
    }

    if (candidates.length > this.maxPlayers) {
      candidates.length = this.maxPlayers;
      this.announce('Risk supports max 6 players. Extra players are set as observers.', 'system');
    }

    // Ensure at least 2 total players by filling with AI participants.
    const neededBots = Math.max(0, this.minPlayers - candidates.length);
    for (let i = 0; i < neededBots; i++) {
      candidates.push(this._createBotParticipant());
    }

    // Optional explicit AI count (bounded).
    const configuredAiCount = Number.isFinite(this.config.aiPlayers)
      ? clamp(Math.floor(this.config.aiPlayers), 0, this.maxPlayers)
      : null;
    if (configuredAiCount !== null) {
      const currentAi = candidates.filter((p) => p.isBot).length;
      const extra = clamp(configuredAiCount - currentAi, 0, this.maxPlayers - candidates.length);
      for (let i = 0; i < extra; i++) {
        candidates.push(this._createBotParticipant());
      }
    }

    if (candidates.length < this.minPlayers) {
      throw new Error('Risk requires at least 2 players');
    }

    shuffle(candidates);
    this.playerOrder = candidates.map((p) => p.id);

    // Keep MiniGame participant map aligned to Risk participants only.
    this.players.clear();
    this.scores.clear();

    for (let i = 0; i < candidates.length; i++) {
      const participant = candidates[i];
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      this.riskPlayers.set(participant.id, {
        id: participant.id,
        name: participant.name,
        color,
        isBot: participant.isBot,
        strategy: participant.strategy || 'balanced',
        eliminated: false,
        cards: [],
      });
      this.players.set(participant.id, { score: 0, alive: true, position: [0, 0, 0] });
      this.scores.set(participant.id, 0);
    }
  }

  _createBotParticipant() {
    const strategy = AI_ORDER[this._botCounter % AI_ORDER.length];
    const profile = RISK_AI_PROFILES[strategy] || RISK_AI_PROFILES.balanced;
    this._botCounter++;
    return {
      id: `risk-ai-${strategy}-${randomUUID().slice(0, 8)}`,
      name: `${profile.name} ${this._botCounter}`,
      isBot: true,
      strategy,
    };
  }

  _initializeTerritories() {
    this.deck = createTerritoryDeck(TERRITORY_IDS);
    this.discardPile.length = 0;
    this.tradeCount = 0;
    this.territories.clear();
    this.initialTroopsRemaining.clear();

    const shuffledTerritoryIds = shuffle([...TERRITORY_IDS]);
    for (let i = 0; i < shuffledTerritoryIds.length; i++) {
      const territoryId = shuffledTerritoryIds[i];
      const ownerId = this.playerOrder[i % this.playerOrder.length];
      const base = TERRITORIES[territoryId];

      this.territories.set(territoryId, {
        id: territoryId,
        name: base.name,
        continent: base.continent,
        adjacent: [...base.adjacent],
        position: [...base.position],
        ownerId,
        troops: 1,
      });
    }

    const playersCount = this.playerOrder.length;
    const initialTroops = getInitialTroopsForPlayerCount(playersCount);
    for (const playerId of this.playerOrder) {
      const ownedCount = this.getOwnedTerritories(playerId).length;
      const remaining = Math.max(0, initialTroops - ownedCount);
      this.initialTroopsRemaining.set(playerId, remaining);
    }
  }

  _spawnBoardEntities() {
    // Ocean base
    this.spawnEntity('platform', [0, 0, 3], [108, 0.3, 70], {
      color: '#17324d',
      opacity: 0.92,
      groupId: 'risk-board-base',
    });

    // Territory entities + labels
    for (const [territoryId, territory] of this.territories) {
      const owner = this.riskPlayers.get(territory.ownerId);
      const groupId = `risk-territory-${territoryId}`;
      const [x, z] = territory.position;

      const territoryEntity = this.spawnEntity('platform', [x, BOARD_Y, z], TERRITORY_SIZE, {
        color: owner?.color || '#7f8c8d',
        groupId,
        riskTerritory: true,
        territoryId,
        riskOwnerId: territory.ownerId,
        riskTroops: territory.troops,
      });

      const labelEntity = this.spawnEntity(
        'decoration',
        [x, BOARD_Y + LABEL_Y_OFFSET, z],
        [0.25, 0.25, 0.25],
        {
          color: '#ffffff',
          groupId,
          isRiskLabel: true,
          territoryId,
          text: this._territoryLabelText(territory),
          bgColor: owner?.color || '#2c3e50',
        },
      );

      this.territoryEntities.set(territoryId, {
        territoryEntityId: territoryEntity.id,
        labelEntityId: labelEntity.id,
      });
    }
  }

  _territoryLabelText(territory) {
    return `${territory.name}\n${territory.troops}`;
  }

  _updateTerritoryVisual(territoryId) {
    const territory = this.territories.get(territoryId);
    const entities = this.territoryEntities.get(territoryId);
    if (!territory || !entities) return;

    const owner = this.riskPlayers.get(territory.ownerId);
    const color = owner?.color || '#7f8c8d';

    try {
      const updatedTerritoryEntity = this.worldState.modifyEntity(entities.territoryEntityId, {
        properties: {
          color,
          riskOwnerId: territory.ownerId,
          riskTroops: territory.troops,
        },
      });
      this.broadcast('entity_modified', updatedTerritoryEntity);
    } catch {
      // If an entity was removed externally, continue game logic.
    }

    try {
      const updatedLabelEntity = this.worldState.modifyEntity(entities.labelEntityId, {
        properties: {
          text: this._territoryLabelText(territory),
          bgColor: color,
        },
      });
      this.broadcast('entity_modified', updatedLabelEntity);
    } catch {
      // If an entity was removed externally, continue game logic.
    }
  }

  _forfeitDisconnectedHumans() {
    for (const [playerId, participant] of this.riskPlayers) {
      if (participant.isBot || participant.eliminated) continue;
      if (this.worldState.players.has(playerId)) continue;
      this._eliminatePlayer(playerId, null, `${participant.name} forfeits (disconnected).`);
    }
  }

  _handleInitialPlacementAction(playerId, action) {
    if (action.type !== 'place_initial' && action.type !== 'reinforce') {
      return { ok: false, error: 'Use place_initial during initial placement' };
    }

    const remaining = this.initialTroopsRemaining.get(playerId) || 0;
    if (remaining <= 0) {
      return { ok: false, error: 'No initial troops left to place' };
    }

    const territory = this.territories.get(action.territoryId);
    if (!territory) return { ok: false, error: 'Invalid territory' };
    if (territory.ownerId !== playerId) {
      return { ok: false, error: 'You can only place on your own territory' };
    }

    territory.troops += 1;
    this.initialTroopsRemaining.set(playerId, remaining - 1);
    this._updateTerritoryVisual(territory.id);

    if (this._allInitialTroopsPlaced()) {
      this.phase = 'reinforce';
      this._startTurnForCurrentPlayer({ initialTurn: true });
      return { ok: true, event: 'initial_placement_complete' };
    }

    this._advanceToNextPlacementPlayer();
    return { ok: true, event: 'initial_placement' };
  }

  _allInitialTroopsPlaced() {
    for (const troops of this.initialTroopsRemaining.values()) {
      if (troops > 0) return false;
    }
    return true;
  }

  _advanceToNextPlacementPlayer() {
    for (let i = 0; i < this.playerOrder.length; i++) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
      const candidateId = this.playerOrder[this.currentPlayerIndex];
      const participant = this.riskPlayers.get(candidateId);
      if (!participant || participant.eliminated) continue;
      if ((this.initialTroopsRemaining.get(candidateId) || 0) > 0) return;
    }
  }

  _startTurnForCurrentPlayer({ initialTurn = false } = {}) {
    const playerId = this.getActivePlayerId();
    if (!playerId) return;

    const participant = this.riskPlayers.get(playerId);
    if (!participant || participant.eliminated) {
      this._advanceToNextAlivePlayer();
      return this._startTurnForCurrentPlayer({ initialTurn });
    }

    this.phase = 'reinforce';
    this.reinforcementPool = this._calculateReinforcements(playerId);
    this.conqueredThisTurn = false;
    this.hasFortifiedThisTurn = false;

    const forcedTradeBonuses = this._autoTradeWhenForced(playerId);
    this.reinforcementPool += forcedTradeBonuses;

    if (!participant.isBot && initialTurn) {
      this.announce(`Initial placement complete. ${participant.name} starts the first turn.`, 'system');
    }

    this.announce(
      `${participant.name}'s turn — Reinforce with ${this.reinforcementPool} troops.`,
      'system',
    );
    if (Math.random() < 0.42) {
      this._agentNarrate(this._buildTurnNarration(participant, this.reinforcementPool));
    }

    this.turnActionAt = Date.now();
    this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
  }

  _calculateReinforcements(playerId) {
    const territoryCount = this.getOwnedTerritories(playerId).length;
    const base = Math.max(3, Math.floor(territoryCount / 3));
    let continentBonus = 0;

    for (const [continentId, members] of Object.entries(CONTINENT_TERRITORIES)) {
      const controlsAll = members.every((territoryId) => this.territories.get(territoryId)?.ownerId === playerId);
      if (controlsAll) continentBonus += CONTINENT_BONUSES[continentId] || 0;
    }

    return base + continentBonus;
  }

  _autoTradeWhenForced(playerId) {
    const player = this.riskPlayers.get(playerId);
    if (!player) return 0;

    let totalBonus = 0;
    while (player.cards.length >= 5) {
      const set = pickBestTradeSet(player.cards);
      if (!set) break;
      const trade = this._tradeCards(playerId, set.map((card) => card.id), true);
      if (!trade.ok) break;
      totalBonus += trade.bonus;
    }
    return totalBonus;
  }

  _tradeCards(playerId, cardIds, forced = false) {
    const player = this.riskPlayers.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player' };

    let selectedCards = [];
    if (Array.isArray(cardIds) && cardIds.length > 0) {
      const wanted = new Set(cardIds);
      selectedCards = player.cards.filter((card) => wanted.has(card.id));
    } else {
      const suggested = pickBestTradeSet(player.cards);
      if (suggested) selectedCards = suggested;
    }

    if (selectedCards.length !== 3 || !isValidTradeSet(selectedCards)) {
      return { ok: false, error: 'Invalid card set' };
    }

    const { removed, remaining } = removeCardsFromHand(player.cards, selectedCards.map((card) => card.id));
    if (removed.length !== 3) {
      return { ok: false, error: 'Selected cards are not all in hand' };
    }
    player.cards = remaining;
    this.discardPile.push(...removed);

    const bonus = getTradeBonus(this.tradeCount);
    this.tradeCount += 1;

    // Classic Risk rule: if player owns a traded territory card, place +2 there.
    let bonusTerritories = 0;
    for (const card of removed) {
      if (!card.territoryId) continue;
      const territory = this.territories.get(card.territoryId);
      if (!territory || territory.ownerId !== playerId) continue;
      territory.troops += 2;
      bonusTerritories += 1;
      this._updateTerritoryVisual(territory.id);
    }

    const forceText = forced ? ' (forced)' : '';
    this.announce(
      `${player.name} trades cards${forceText} for +${bonus} troops${bonusTerritories ? ` and +2 on ${bonusTerritories} territories` : ''}.`,
      'challenge',
    );

    return { ok: true, bonus };
  }

  _handleReinforceAction(playerId, action) {
    if (action.type === 'trade_cards') {
      const trade = this._tradeCards(playerId, action.cardIds || null, false);
      if (!trade.ok) return trade;
      this.reinforcementPool += trade.bonus;
      return { ok: true, event: 'trade_cards', bonus: trade.bonus };
    }

    if (action.type === 'end_phase') {
      if (this.reinforcementPool > 0) {
        return { ok: false, error: `You still have ${this.reinforcementPool} reinforcement troops` };
      }
      this.phase = 'attack';
      return { ok: true, event: 'phase_changed' };
    }

    if (action.type !== 'reinforce') {
      return { ok: false, error: 'Use reinforce or trade_cards during reinforce phase' };
    }

    if (this.reinforcementPool <= 0) {
      this.phase = 'attack';
      return { ok: true, event: 'phase_changed' };
    }

    const territory = this.territories.get(action.territoryId);
    if (!territory) return { ok: false, error: 'Invalid territory' };
    if (territory.ownerId !== playerId) return { ok: false, error: 'Can only reinforce your own territory' };

    const troops = clamp(Number.isFinite(action.troops) ? Math.floor(action.troops) : 1, 1, this.reinforcementPool);
    territory.troops += troops;
    this.reinforcementPool -= troops;
    this._updateTerritoryVisual(territory.id);

    if (this.reinforcementPool === 0) {
      this.phase = 'attack';
    }

    return { ok: true, event: 'reinforce', troopsPlaced: troops, poolRemaining: this.reinforcementPool };
  }

  _handleAttackAction(playerId, action) {
    if (action.type === 'end_phase') {
      this.phase = 'fortify';
      return { ok: true, event: 'phase_changed' };
    }

    if (action.type !== 'attack') {
      return { ok: false, error: 'Use attack or end_phase during attack phase' };
    }

    const from = this.territories.get(action.fromTerritoryId || action.fromId);
    const to = this.territories.get(action.toTerritoryId || action.toId);
    if (!from || !to) return { ok: false, error: 'Invalid attack territories' };
    if (from.ownerId !== playerId) return { ok: false, error: 'Attack source must be owned by attacker' };
    if (to.ownerId === playerId) return { ok: false, error: 'Target must be enemy territory' };
    if (!from.adjacent.includes(to.id)) return { ok: false, error: 'Territories are not adjacent' };
    if (from.troops < 2) return { ok: false, error: 'Need at least 2 troops to attack' };

    const requestedDice = Number.isFinite(action.dice) ? Math.floor(action.dice) : null;
    const combat = resolveCombat({
      attackerTroops: from.troops,
      defenderTroops: to.troops,
      requestedAttackDice: requestedDice,
    });

    from.troops -= combat.attackerLosses;
    to.troops -= combat.defenderLosses;
    this._updateTerritoryVisual(from.id);
    this._updateTerritoryVisual(to.id);

    this._spawnDiceVisual(combat.attackerRolls, combat.defenderRolls, playerId, to.ownerId);

    const attackerName = this.riskPlayers.get(playerId)?.name || playerId;
    const defenderName = this.riskPlayers.get(to.ownerId)?.name || to.ownerId;
    this.announce(
      `${attackerName} attacks ${to.name} from ${from.name} (${combat.attackerRolls.join(',')} vs ${combat.defenderRolls.join(',')})`,
      'system',
    );

    this.broadcast('risk_battle', {
      attackerId: playerId,
      defenderId: to.ownerId,
      fromTerritoryId: from.id,
      toTerritoryId: to.id,
      attackerRolls: combat.attackerRolls,
      defenderRolls: combat.defenderRolls,
      attackerLosses: combat.attackerLosses,
      defenderLosses: combat.defenderLosses,
    });
    this._agentNarrate(
      this._buildBattleNarration({
        attackerName,
        defenderName,
        fromName: from.name,
        toName: to.name,
        attackerLosses: combat.attackerLosses,
        defenderLosses: combat.defenderLosses,
      }),
    );

    if (to.troops <= 0) {
      const defenderId = to.ownerId;
      to.ownerId = playerId;

      const maxMove = Math.max(1, from.troops - 1);
      const minMove = Math.min(combat.attackDice, maxMove);
      const requestedMove = Number.isFinite(action.moveTroops) ? Math.floor(action.moveTroops) : minMove;
      const moveTroops = clamp(requestedMove, minMove, maxMove);

      from.troops -= moveTroops;
      to.troops = moveTroops;
      this.conqueredThisTurn = true;
      this.addScore(playerId, 2);

      this._updateTerritoryVisual(from.id);
      this._updateTerritoryVisual(to.id);

      this.announce(`${attackerName} conquered ${to.name}!`, 'challenge');
      this._agentNarrate(`${attackerName} seizes ${to.name}. Momentum shifts!`);

      if (this.getOwnedTerritories(defenderId).length === 0) {
        this._eliminatePlayer(defenderId, playerId, `${defenderName} has been eliminated!`);
      }
    }

    const winner = this._getWinnerId();
    if (winner) {
      this.end('win', winner);
      return { ok: true, event: 'game_over', winnerId: winner };
    }

    if (!this._canPlayerAttack(playerId)) {
      this.phase = 'fortify';
    }

    return { ok: true, event: 'attack_resolved', combat };
  }

  _handleFortifyAction(playerId, action) {
    if (action.type === 'end_phase') {
      this._endTurnAndAdvance();
      return { ok: true, event: 'turn_advanced' };
    }

    if (action.type !== 'fortify') {
      return { ok: false, error: 'Use fortify or end_phase during fortify phase' };
    }

    if (this.hasFortifiedThisTurn) {
      return { ok: false, error: 'Fortify already used this turn' };
    }

    const from = this.territories.get(action.fromTerritoryId || action.fromId);
    const to = this.territories.get(action.toTerritoryId || action.toId);
    if (!from || !to) return { ok: false, error: 'Invalid fortify territories' };
    if (from.ownerId !== playerId || to.ownerId !== playerId) {
      return { ok: false, error: 'Fortify can only move troops between your territories' };
    }
    if (from.id === to.id) return { ok: false, error: 'Source and destination must differ' };
    if (from.troops < 2) return { ok: false, error: 'Need at least 2 troops to fortify' };

    const connected = this.getConnectedOwnedTerritories(from.id, playerId);
    if (!connected.has(to.id)) {
      return { ok: false, error: 'Territories are not connected through owned path' };
    }

    const movable = from.troops - 1;
    const troops = clamp(Number.isFinite(action.troops) ? Math.floor(action.troops) : 1, 1, movable);
    from.troops -= troops;
    to.troops += troops;
    this.hasFortifiedThisTurn = true;

    this._updateTerritoryVisual(from.id);
    this._updateTerritoryVisual(to.id);

    this.announce(`${this.riskPlayers.get(playerId)?.name || playerId} fortifies ${to.name} (+${troops})`, 'system');

    this._endTurnAndAdvance();
    return { ok: true, event: 'fortify', troopsMoved: troops };
  }

  _endTurnAndAdvance() {
    const currentPlayerId = this.getActivePlayerId();
    if (!currentPlayerId) return;

    if (this.conqueredThisTurn) {
      const player = this.riskPlayers.get(currentPlayerId);
      const card = drawCard(this.deck, this.discardPile);
      if (card && player) {
        player.cards.push(card);
        this.announce(`${player.name} earned a territory card.`, 'system');
      }
    }

    const winner = this._getWinnerId();
    if (winner) {
      this.end('win', winner);
      return;
    }

    this._advanceToNextAlivePlayer();
    this._startTurnForCurrentPlayer();
  }

  _advanceToNextAlivePlayer() {
    if (this.playerOrder.length === 0) return null;
    const previousIndex = this.currentPlayerIndex;

    for (let i = 0; i < this.playerOrder.length; i++) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
      const nextId = this.playerOrder[this.currentPlayerIndex];
      const next = this.riskPlayers.get(nextId);
      if (!next || next.eliminated) continue;
      if (this.currentPlayerIndex <= previousIndex) this.turnNumber += 1;
      return nextId;
    }
    return null;
  }

  _canPlayerAttack(playerId) {
    const owned = this.getOwnedTerritories(playerId);
    for (const territory of owned) {
      if (territory.troops < 2) continue;
      if (this.getEnemyNeighbors(territory.id, playerId).length > 0) return true;
    }
    return false;
  }

  _eliminatePlayer(eliminatedPlayerId, attackerId = null, message = null) {
    const eliminated = this.riskPlayers.get(eliminatedPlayerId);
    if (!eliminated || eliminated.eliminated) return;

    eliminated.eliminated = true;
    const tracked = this.players.get(eliminatedPlayerId);
    if (tracked) tracked.alive = false;
    this.losers.push(eliminatedPlayerId);

    if (attackerId) {
      const attacker = this.riskPlayers.get(attackerId);
      if (attacker && eliminated.cards.length > 0) {
        attacker.cards.push(...eliminated.cards);
      }
    }
    eliminated.cards = [];

    this.announce(message || `${eliminated.name} has been eliminated.`, 'challenge');
    this._agentNarrate(`${eliminated.name} is out of the war. The board grows deadlier.`);
  }

  _performAiStep(playerId) {
    const ai = this.riskPlayers.get(playerId);
    if (!ai || !ai.isBot || ai.eliminated) return;

    if (this.phase === 'initial_placement') {
      const placementTarget = chooseReinforcement(this, playerId, ai.strategy, 1);
      if (placementTarget) {
        this.handlePlayerAction(playerId, {
          type: 'place_initial',
          territoryId: placementTarget.territoryId,
        });
      }
      this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
      return;
    }

    if (this.phase === 'reinforce') {
      if (this.reinforcementPool <= 0) {
        this.handlePlayerAction(playerId, { type: 'end_phase' });
      } else {
        // Optional trade if profitable and available
        const hasTrade = pickBestTradeSet(ai.cards);
        if (hasTrade && ai.cards.length >= 3 && Math.random() < 0.45) {
          this.handlePlayerAction(playerId, { type: 'trade_cards' });
        } else {
          const reinforce = chooseReinforcement(this, playerId, ai.strategy, 1);
          if (reinforce) {
            this.handlePlayerAction(playerId, {
              type: 'reinforce',
              territoryId: reinforce.territoryId,
              troops: reinforce.troops,
            });
          } else {
            this.handlePlayerAction(playerId, { type: 'end_phase' });
          }
        }
      }
      this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
      return;
    }

    if (this.phase === 'attack') {
      const attack = chooseAttack(this, playerId, ai.strategy);
      if (!attack) {
        this.handlePlayerAction(playerId, { type: 'end_phase' });
      } else {
        this.handlePlayerAction(playerId, {
          type: 'attack',
          fromTerritoryId: attack.fromId,
          toTerritoryId: attack.toId,
          dice: attack.dice,
        });
      }
      this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
      return;
    }

    if (this.phase === 'fortify') {
      const fortify = chooseFortify(this, playerId, ai.strategy);
      if (fortify) {
        this.handlePlayerAction(playerId, {
          type: 'fortify',
          fromTerritoryId: fortify.fromId,
          toTerritoryId: fortify.toId,
          troops: fortify.troops,
        });
      } else {
        this.handlePlayerAction(playerId, { type: 'end_phase' });
      }
      this.nextAiActionAt = Date.now() + AI_ACTION_DELAY_MS;
    }
  }

  _performTimedAutoAction(playerId) {
    const player = this.riskPlayers.get(playerId);
    if (!player || player.isBot || player.eliminated) return;

    if (this.phase === 'initial_placement') {
      const owned = this.getOwnedTerritories(playerId);
      if (owned.length > 0) {
        const territory = owned[randomInt(owned.length)];
        this.handlePlayerAction(playerId, { type: 'place_initial', territoryId: territory.id });
      }
      this.announce(`${player.name} took too long — auto-placed initial troop.`, 'system');
      return;
    }

    if (this.phase === 'reinforce') {
      const owned = this.getOwnedTerritories(playerId);
      if (owned.length > 0 && this.reinforcementPool > 0) {
        const territory = owned[randomInt(owned.length)];
        this.handlePlayerAction(playerId, {
          type: 'reinforce',
          territoryId: territory.id,
          troops: 1,
        });
      } else {
        this.handlePlayerAction(playerId, { type: 'end_phase' });
      }
      this.announce(`${player.name} timed out — auto reinforcement applied.`, 'system');
      return;
    }

    if (this.phase === 'attack' || this.phase === 'fortify') {
      this.handlePlayerAction(playerId, { type: 'end_phase' });
      this.announce(`${player.name} timed out — phase ended automatically.`, 'system');
    }
  }

  _spawnDiceVisual(attackerRolls, defenderRolls, attackerId, defenderId) {
    const attackerColor = this.riskPlayers.get(attackerId)?.color || '#e74c3c';
    const defenderColor = this.riskPlayers.get(defenderId)?.color || '#95a5a6';
    const groupId = `risk-dice-${randomUUID().slice(0, 8)}`;

    const diceEntities = [];
    const spacing = 1.4;
    const baseX = -((Math.max(attackerRolls.length, defenderRolls.length) - 1) * spacing) / 2;
    const y = 5.5;
    const attackerZ = -24;
    const defenderZ = -21.5;

    for (let i = 0; i < attackerRolls.length; i++) {
      diceEntities.push(
        this.spawnEntity('decoration', [baseX + i * spacing, y, attackerZ], [0.9, 0.9, 0.9], {
          color: attackerColor,
          groupId,
          riskDieValue: attackerRolls[i],
          riskDieSide: 'attacker',
        }),
      );
    }
    for (let i = 0; i < defenderRolls.length; i++) {
      diceEntities.push(
        this.spawnEntity('decoration', [baseX + i * spacing, y, defenderZ], [0.9, 0.9, 0.9], {
          color: defenderColor,
          groupId,
          riskDieValue: defenderRolls[i],
          riskDieSide: 'defender',
        }),
      );
    }

    setTimeout(() => {
      for (const entity of diceEntities) {
        try {
          this.worldState.destroyEntity(entity.id);
          this.broadcast('entity_destroyed', { id: entity.id });
        } catch {
          // Entity may already be gone.
        }
      }
    }, DICE_VISUAL_MS);
  }

  _getLeaderByTerritories() {
    let leader = null;
    let max = -1;
    for (const [playerId, p] of this.riskPlayers) {
      if (p.eliminated) continue;
      const count = this.getOwnedTerritories(playerId).length;
      if (count > max) {
        max = count;
        leader = { id: playerId, territories: count };
      }
    }
    return leader;
  }

  _getWinnerId() {
    const alive = [];
    for (const [id, player] of this.riskPlayers) {
      if (!player.eliminated) alive.push(id);
    }
    if (alive.length === 1) return alive[0];

    for (const candidateId of alive) {
      if (this.getOwnedTerritories(candidateId).length === TERRITORY_IDS.length) {
        return candidateId;
      }
    }
    return null;
  }

  _syncGameStateSummary() {
    this.worldState.gameState.riskState = this._buildRiskState();
  }

  _agentNarrate(text) {
    const message = this.worldState.addMessage('AI Game Master', 'agent', text);
    this.broadcast('chat_message', message);
  }

  _buildTurnNarration(participant, reinforcements) {
    const lines = [
      `${participant.name}, choose your pressure point. ${reinforcements} reinforcements can make or break a continent.`,
      `${participant.name} surveys the map — opportunity favors decisive reinforcement.`,
      `Risk is positional warfare. ${participant.name} now controls the tempo.`,
    ];
    return lines[randomInt(lines.length)];
  }

  _buildBattleNarration({
    attackerName,
    defenderName,
    fromName,
    toName,
    attackerLosses,
    defenderLosses,
  }) {
    if (defenderLosses > attackerLosses) {
      return `${attackerName} presses from ${fromName} into ${toName}. ${defenderName} is on the back foot.`;
    }
    if (attackerLosses > defenderLosses) {
      return `${defenderName} holds ${toName}! ${attackerName}'s advance from ${fromName} stalls.`;
    }
    return `${fromName} and ${toName} trade blood evenly. Neither commander yields ground.`;
  }

  _broadcastRiskState(reason = 'update') {
    const riskState = this._buildRiskState();
    this.worldState.gameState.riskState = riskState;
    this.broadcast('risk_state', { reason, state: riskState });
  }

  _buildRiskState() {
    const activePlayerId = this.getActivePlayerId();

    const players = this.playerOrder.map((playerId) => {
      const player = this.riskPlayers.get(playerId);
      const owned = this.getOwnedTerritories(playerId).length;
      const isAlive = player ? !player.eliminated : false;
      const cards = player?.cards || [];

      return {
        id: playerId,
        name: player?.name || playerId,
        color: player?.color || '#7f8c8d',
        isBot: Boolean(player?.isBot),
        strategy: player?.strategy || null,
        eliminated: !isAlive,
        territories: owned,
        cardCount: cards.length,
        cards,
        cardSummary: formatCardSummary(cards),
      };
    });

    const territories = TERRITORY_IDS.map((territoryId) => {
      const territory = this.territories.get(territoryId);
      return {
        id: territory.id,
        name: territory.name,
        continent: territory.continent,
        position: territory.position,
        adjacent: territory.adjacent,
        ownerId: territory.ownerId,
        ownerName: this.riskPlayers.get(territory.ownerId)?.name || territory.ownerId,
        troops: territory.troops,
      };
    });

    const continentControl = {};
    for (const [continentId, ids] of Object.entries(CONTINENT_TERRITORIES)) {
      const firstOwner = this.territories.get(ids[0])?.ownerId || null;
      const controlled = ids.every((territoryId) => this.territories.get(territoryId)?.ownerId === firstOwner);
      continentControl[continentId] = {
        name: CONTINENTS[continentId],
        bonus: CONTINENT_BONUSES[continentId],
        ownerId: controlled ? firstOwner : null,
        ownerName: controlled ? this.riskPlayers.get(firstOwner)?.name || firstOwner : null,
      };
    }

    return {
      gameId: this.id,
      phase: this.phase,
      turnNumber: this.turnNumber,
      activePlayerId,
      activePlayerName: this.riskPlayers.get(activePlayerId)?.name || null,
      reinforcementPool: this.reinforcementPool,
      conqueredThisTurn: this.conqueredThisTurn,
      hasFortifiedThisTurn: this.hasFortifiedThisTurn,
      initialTroopsRemaining: Object.fromEntries(this.initialTroopsRemaining),
      tradeCount: this.tradeCount,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      continents: continentControl,
      players,
      territories,
    };
  }

  _updateScoresFromBoardControl() {
    for (const playerId of this.playerOrder) {
      const territoryCount = this.getOwnedTerritories(playerId).length;
      this.scores.set(playerId, territoryCount);
      const scoreData = this.players.get(playerId);
      if (scoreData) scoreData.score = territoryCount;
    }
  }

  getActivePlayerId() {
    if (this.playerOrder.length === 0) return null;
    return this.playerOrder[this.currentPlayerIndex] || null;
  }

  getOwnedTerritories(playerId) {
    const list = [];
    for (const territory of this.territories.values()) {
      if (territory.ownerId === playerId) list.push(territory);
    }
    return list;
  }

  getEnemyNeighbors(territoryId, ownerId) {
    const territory = this.territories.get(territoryId);
    if (!territory) return [];
    const enemies = [];
    for (const adjacentId of territory.adjacent) {
      const adjacent = this.territories.get(adjacentId);
      if (adjacent && adjacent.ownerId !== ownerId) enemies.push(adjacent);
    }
    return enemies;
  }

  getConnectedOwnedTerritories(startTerritoryId, ownerId) {
    const visited = new Set();
    const queue = [startTerritoryId];
    visited.add(startTerritoryId);

    while (queue.length > 0) {
      const territoryId = queue.shift();
      const territory = this.territories.get(territoryId);
      if (!territory) continue;

      for (const adjacentId of territory.adjacent) {
        if (visited.has(adjacentId)) continue;
        const adjacent = this.territories.get(adjacentId);
        if (!adjacent || adjacent.ownerId !== ownerId) continue;
        visited.add(adjacentId);
        queue.push(adjacentId);
      }
    }

    return visited;
  }

  getResultMessage(result, winnerId) {
    if (result === 'win' && winnerId) {
      const winner = this.riskPlayers.get(winnerId);
      return `${winner?.name || winnerId} now controls the world!`;
    }
    return super.getResultMessage(result, winnerId);
  }

  end(result, winnerId = null) {
    this._updateScoresFromBoardControl();
    this._syncGameStateSummary();
    return super.end(result, winnerId);
  }

  getStatus() {
    const base = super.getStatus();
    return {
      ...base,
      phase: this.phase,
      turnNumber: this.turnNumber,
      activePlayerId: this.getActivePlayerId(),
      riskState: this._buildRiskState(),
    };
  }
}
