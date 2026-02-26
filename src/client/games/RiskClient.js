/**
 * Risk client-side interaction + HUD panel.
 *
 * - Receives risk_state snapshots from server
 * - Click-to-interact with territory entities
 * - Sends risk_action messages to server
 */

import * as THREE from 'three';
import { state, entityMeshes } from '../state.js';
import { sendToServer } from '../network/NetworkManager.js';

const riskClient = {
  initialized: false,
  camera: null,
  domElement: null,
  raycaster: new THREE.Raycaster(),
  ndc: new THREE.Vector2(),
  current: null,
  territoryById: new Map(),
  selectedTerritoryId: null,
  lastClickAt: 0,
};

function _$(id) {
  return document.getElementById(id);
}

function getLocalPlayerId() {
  return state.room?.sessionId || null;
}

function isRiskPlaying() {
  return state.gameState?.gameType === 'risk' && state.gameState?.phase === 'playing';
}

function isLocalTurn() {
  const localId = getLocalPlayerId();
  return Boolean(localId && riskClient.current?.activePlayerId === localId);
}

function getTerritory(territoryId) {
  return riskClient.territoryById.get(territoryId) || null;
}

function getLocalPlayer() {
  const localId = getLocalPlayerId();
  return riskClient.current?.players?.find((p) => p.id === localId) || null;
}

function isOwnedByLocal(territoryId) {
  const territory = getTerritory(territoryId);
  return territory?.ownerId === getLocalPlayerId();
}

function getConnectedOwnedTerritories(startTerritoryId, ownerId) {
  const visited = new Set();
  const queue = [startTerritoryId];
  visited.add(startTerritoryId);

  while (queue.length > 0) {
    const territoryId = queue.shift();
    const territory = getTerritory(territoryId);
    if (!territory) continue;
    for (const adjacentId of territory.adjacent) {
      if (visited.has(adjacentId)) continue;
      const adjacent = getTerritory(adjacentId);
      if (!adjacent || adjacent.ownerId !== ownerId) continue;
      visited.add(adjacentId);
      queue.push(adjacentId);
    }
  }

  return visited;
}

function updateSelectionHighlights() {
  for (const mesh of entityMeshes.values()) {
    const entity = mesh.userData?.entity;
    const territoryId = entity?.properties?.territoryId;
    if (!entity?.properties?.riskTerritory || !territoryId) continue;
    if (!mesh.material) continue;

    if (!mesh.userData._riskSelectionMaterialCloned) {
      mesh.material = mesh.material.clone();
      mesh.userData._riskSelectionMaterialCloned = true;
    }

    const selected = territoryId === riskClient.selectedTerritoryId;
    mesh.material.emissiveIntensity = selected ? 0.7 : 0.15;
    mesh.material.emissive.set(selected ? '#ffffff' : entity.properties.color || '#222222');
  }
}

function getPhaseHint() {
  const phase = riskClient.current?.phase;
  if (!phase) return '';
  if (!isLocalTurn()) return 'Wait for your turn.';

  if (phase === 'initial_placement') return 'Click one of your territories to place an initial troop.';
  if (phase === 'reinforce') return 'Click your territories to reinforce. Use Trade to trade cards.';
  if (phase === 'attack') {
    if (!riskClient.selectedTerritoryId) return 'Select your attacking territory (2+ troops), then click an adjacent enemy.';
    return 'Click an adjacent enemy territory to attack, or click selected territory again to cancel.';
  }
  if (phase === 'fortify') {
    if (!riskClient.selectedTerritoryId) return 'Select a source territory (2+ troops), then another connected owned territory.';
    return 'Select a connected owned destination territory to fortify.';
  }
  return '';
}

function renderRiskPanel() {
  const panel = _$('risk-panel');
  if (!panel) return;

  const riskState = riskClient.current;
  if (!riskState || state.gameState?.gameType !== 'risk' || state.gameState?.phase === 'ended') {
    panel.style.display = 'none';
    riskClient.selectedTerritoryId = null;
    updateSelectionHighlights();
    return;
  }

  panel.style.display = 'block';

  _$('risk-phase').textContent = `${riskState.phase.replace(/_/g, ' ').toUpperCase()} • Turn ${riskState.turnNumber}`;
  _$('risk-active').textContent = riskState.activePlayerName || '-';
  _$('risk-reinforcements').textContent = String(riskState.reinforcementPool || 0);
  _$('risk-selection').textContent = getPhaseHint();

  const localPlayer = getLocalPlayer();
  _$('risk-cards').textContent = localPlayer ? `${localPlayer.cardCount} cards` : '-';

  const playerListEl = _$('risk-player-list');
  if (playerListEl) {
    playerListEl.innerHTML = (riskState.players || []).map((p) => (
      `<div class="risk-player-row ${p.eliminated ? 'eliminated' : ''}" style="border-left-color:${p.color}">
        <span class="name">${p.name}</span>
        <span class="meta">${p.territories} terr • ${p.cardCount} cards</span>
      </div>`
    )).join('');
  }

  const canAct = isRiskPlaying() && isLocalTurn();
  const endBtn = _$('risk-end-phase-btn');
  const tradeBtn = _$('risk-trade-btn');
  if (endBtn) endBtn.disabled = !canAct;
  if (tradeBtn) tradeBtn.disabled = !canAct;

  updateSelectionHighlights();
}

function sendRiskAction(payload) {
  if (!isRiskPlaying()) return false;
  if (!isLocalTurn()) return false;
  return sendToServer('risk_action', payload);
}

function handleTerritoryClick(territoryId) {
  if (!territoryId || !riskClient.current || !isLocalTurn()) return;
  const phase = riskClient.current.phase;
  const territory = getTerritory(territoryId);
  if (!territory) return;

  if (phase === 'initial_placement') {
    sendRiskAction({ type: 'place_initial', territoryId });
    return;
  }

  if (phase === 'reinforce') {
    if (!isOwnedByLocal(territoryId)) return;
    sendRiskAction({ type: 'reinforce', territoryId, troops: 1 });
    return;
  }

  if (phase === 'attack') {
    if (!riskClient.selectedTerritoryId) {
      if (!isOwnedByLocal(territoryId) || territory.troops < 2) return;
      riskClient.selectedTerritoryId = territoryId;
      renderRiskPanel();
      return;
    }

    if (territoryId === riskClient.selectedTerritoryId) {
      riskClient.selectedTerritoryId = null;
      renderRiskPanel();
      return;
    }

    if (isOwnedByLocal(territoryId)) {
      const own = getTerritory(territoryId);
      if (own?.troops >= 2) {
        riskClient.selectedTerritoryId = territoryId;
        renderRiskPanel();
      }
      return;
    }

    const from = getTerritory(riskClient.selectedTerritoryId);
    if (!from || !from.adjacent.includes(territoryId) || from.troops < 2) return;
    const dice = Math.min(3, from.troops - 1);
    sendRiskAction({
      type: 'attack',
      fromTerritoryId: from.id,
      toTerritoryId: territoryId,
      dice,
    });
    return;
  }

  if (phase === 'fortify') {
    if (!riskClient.selectedTerritoryId) {
      if (!isOwnedByLocal(territoryId) || territory.troops < 2) return;
      riskClient.selectedTerritoryId = territoryId;
      renderRiskPanel();
      return;
    }

    if (territoryId === riskClient.selectedTerritoryId) {
      riskClient.selectedTerritoryId = null;
      renderRiskPanel();
      return;
    }

    if (!isOwnedByLocal(territoryId)) return;
    const from = getTerritory(riskClient.selectedTerritoryId);
    const to = getTerritory(territoryId);
    if (!from || !to) return;
    const connected = getConnectedOwnedTerritories(from.id, from.ownerId);
    if (!connected.has(to.id)) return;

    const troops = Math.max(1, Math.floor((from.troops - 1) / 2));
    sendRiskAction({
      type: 'fortify',
      fromTerritoryId: from.id,
      toTerritoryId: to.id,
      troops,
    });
    return;
  }
}

function handlePointerDown(event) {
  if (!riskClient.camera || !riskClient.domElement) return;
  if (!isRiskPlaying()) return;
  if (!isLocalTurn()) return;

  const now = Date.now();
  if (now - riskClient.lastClickAt < 150) return;
  riskClient.lastClickAt = now;

  const rect = riskClient.domElement.getBoundingClientRect();
  riskClient.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  riskClient.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  const meshes = [];
  for (const mesh of entityMeshes.values()) {
    const entity = mesh.userData?.entity;
    if (!entity?.properties?.riskTerritory) continue;
    meshes.push(mesh);
  }
  if (meshes.length === 0) return;

  riskClient.raycaster.setFromCamera(riskClient.ndc, riskClient.camera);
  const hits = riskClient.raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) return;

  const hit = hits[0].object;
  const territoryId = hit?.userData?.entity?.properties?.territoryId;
  handleTerritoryClick(territoryId);
}

function attachUiEvents() {
  const endBtn = _$('risk-end-phase-btn');
  const tradeBtn = _$('risk-trade-btn');
  if (endBtn && !endBtn.dataset.bound) {
    endBtn.dataset.bound = 'true';
    endBtn.addEventListener('click', () => sendRiskAction({ type: 'end_phase' }));
  }
  if (tradeBtn && !tradeBtn.dataset.bound) {
    tradeBtn.dataset.bound = 'true';
    tradeBtn.addEventListener('click', () => sendRiskAction({ type: 'trade_cards' }));
  }
}

export function initRiskClient({ camera, domElement }) {
  if (riskClient.initialized) return;
  riskClient.initialized = true;
  riskClient.camera = camera;
  riskClient.domElement = domElement;
  attachUiEvents();
  domElement.addEventListener('pointerdown', handlePointerDown);
}

export function applyRiskStateSnapshot(nextState) {
  if (!nextState) {
    riskClient.current = null;
    riskClient.territoryById.clear();
    riskClient.selectedTerritoryId = null;
    renderRiskPanel();
    return;
  }

  riskClient.current = nextState;
  riskClient.territoryById.clear();
  for (const territory of nextState.territories || []) {
    riskClient.territoryById.set(territory.id, territory);
  }

  const selected = riskClient.selectedTerritoryId && getTerritory(riskClient.selectedTerritoryId);
  if (!selected || selected.ownerId !== getLocalPlayerId()) {
    riskClient.selectedTerritoryId = null;
  }
  renderRiskPanel();
}

export function applyRiskStateFromGameState(gameState) {
  if (!gameState || gameState.gameType !== 'risk') {
    applyRiskStateSnapshot(null);
    return;
  }
  applyRiskStateSnapshot(gameState.riskState || null);
}

export function onRiskBattleEvent() {
  // Hook point for future dedicated battle timeline UI.
}

export function onRiskActionResult(result) {
  if (result?.ok) return;
  // Error toasts are handled via existing chat_error pipeline.
}
