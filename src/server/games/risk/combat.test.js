import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttackDiceCount, getDefenseDiceCount, resolveCombat } from './combat.js';

function sequenceRng(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test('dice count clamps to Risk limits', () => {
  assert.equal(getAttackDiceCount(2, 3), 1);
  assert.equal(getAttackDiceCount(6, 9), 3);
  assert.equal(getAttackDiceCount(4, 0), 1);

  assert.equal(getDefenseDiceCount(1, 2), 1);
  assert.equal(getDefenseDiceCount(5, 9), 2);
});

test('defender wins ties in combat pair comparisons', () => {
  // attacker roll: 6, defender roll: 6
  const rng = sequenceRng([0.999, 0.999]);
  const result = resolveCombat({
    attackerTroops: 5,
    defenderTroops: 2,
    requestedAttackDice: 1,
    requestedDefenseDice: 1,
    rng,
  });

  assert.deepEqual(result.attackerRolls, [6]);
  assert.deepEqual(result.defenderRolls, [6]);
  assert.equal(result.attackerLosses, 1);
  assert.equal(result.defenderLosses, 0);
});

test('multi-dice combat resolves highest sorted pairs', () => {
  // attacker (3 dice): [6, 5, 1], defender (2 dice): [6, 2]
  // pair 1: 6 vs 6 -> attacker loses
  // pair 2: 5 vs 2 -> defender loses
  const rng = sequenceRng([0.999, 0.7, 0.0, 0.999, 0.2]);
  const result = resolveCombat({
    attackerTroops: 10,
    defenderTroops: 5,
    requestedAttackDice: 3,
    requestedDefenseDice: 2,
    rng,
  });

  assert.deepEqual(result.attackerRolls, [6, 5, 1]);
  assert.deepEqual(result.defenderRolls, [6, 2]);
  assert.equal(result.attackerLosses, 1);
  assert.equal(result.defenderLosses, 1);
});
