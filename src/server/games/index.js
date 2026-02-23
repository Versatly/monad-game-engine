/**
 * Mini-Games Index
 *
 * Export all mini-game classes for easy importing.
 * Add your own game types here.
 */

import { MiniGame, GAME_TYPES } from '../MiniGame.js';
import { ReachGoal } from './ReachGoal.js';
import { RiskGame } from './RiskGame.js';

export { MiniGame, GAME_TYPES, ReachGoal, RiskGame };

// Factory function to create games by type (sync)
export function createGameSync(type, worldState, broadcastFn, config = {}) {
  switch (type) {
    case 'reach':
      return new ReachGoal(worldState, broadcastFn, config);
    case 'risk':
      return new RiskGame(worldState, broadcastFn, config);
    // Add your game types here:
    // case 'collect':
    //   return new CollectGame(worldState, broadcastFn, config);
    default:
      throw new Error(`Unknown game type: ${type}. Register it in src/server/games/index.js`);
  }
}
