/**
 * Risk combat resolver.
 *
 * The attacker rolls up to 3 dice, defender up to 2 dice.
 * Highest sorted pairs are compared; ties favor the defender.
 */

export function rollDice(count, rng = Math.random) {
  const safeCount = Math.max(0, Math.floor(count));
  const rolls = [];
  for (let i = 0; i < safeCount; i++) {
    rolls.push(1 + Math.floor(rng() * 6));
  }
  rolls.sort((a, b) => b - a);
  return rolls;
}

export function getAttackDiceCount(attackerTroops, requested = null) {
  const maxDice = Math.max(1, Math.min(3, attackerTroops - 1));
  if (!Number.isFinite(requested)) return maxDice;
  return Math.max(1, Math.min(maxDice, Math.floor(requested)));
}

export function getDefenseDiceCount(defenderTroops, requested = null) {
  const maxDice = Math.max(1, Math.min(2, defenderTroops));
  if (!Number.isFinite(requested)) return maxDice;
  return Math.max(1, Math.min(maxDice, Math.floor(requested)));
}

export function resolveCombat({
  attackerTroops,
  defenderTroops,
  requestedAttackDice = null,
  requestedDefenseDice = null,
  rng = Math.random,
}) {
  if (attackerTroops < 2) {
    throw new Error('Attacker needs at least 2 troops to attack');
  }
  if (defenderTroops < 1) {
    throw new Error('Defender must have at least 1 troop');
  }

  const attackDice = getAttackDiceCount(attackerTroops, requestedAttackDice);
  const defenseDice = getDefenseDiceCount(defenderTroops, requestedDefenseDice);

  const attackerRolls = rollDice(attackDice, rng);
  const defenderRolls = rollDice(defenseDice, rng);
  const comparisons = Math.min(attackerRolls.length, defenderRolls.length);

  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairResults = [];

  for (let i = 0; i < comparisons; i++) {
    const attackerDie = attackerRolls[i];
    const defenderDie = defenderRolls[i];
    const winner = attackerDie > defenderDie ? 'attacker' : 'defender';

    if (winner === 'attacker') defenderLosses++;
    else attackerLosses++;

    pairResults.push({
      index: i,
      attackerDie,
      defenderDie,
      winner,
    });
  }

  return {
    attackDice,
    defenseDice,
    attackerRolls,
    defenderRolls,
    attackerLosses,
    defenderLosses,
    pairResults,
  };
}
