import { showToast } from '../../ui/Announcements.js';
import {
  applyRiskStateSnapshot,
  onRiskBattleEvent,
  onRiskActionResult,
} from '../../games/RiskClient.js';
import { state } from '../../state.js';

export function registerRiskHandlers(room) {
  room.onMessage('risk_state', (payload) => {
    applyRiskStateSnapshot(payload?.state || null);
  });

  room.onMessage('risk_battle', (battle) => {
    onRiskBattleEvent(battle);

    const localId = room.sessionId;
    if (battle.attackerId === localId || battle.defenderId === localId) {
      const asAttacker = battle.attackerId === localId;
      const losses = asAttacker ? battle.attackerLosses : battle.defenderLosses;
      const color = losses > 0 ? 'warning' : 'success';
      showToast(`Battle resolved (${asAttacker ? 'attacker' : 'defender'}) — losses: ${losses}`, color);
    }
  });

  room.onMessage('risk_action_result', (result) => {
    onRiskActionResult(result);
    if (!result?.ok && state.gameState?.gameType === 'risk') {
      showToast(result?.error || 'Risk action failed', 'error');
    }
  });
}
