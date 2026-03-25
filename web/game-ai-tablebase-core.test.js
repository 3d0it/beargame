import { describe, expect, it } from 'vitest';
import {
  evaluateBearTurnFromSuccessors,
  evaluateHuntersTurnFromSuccessors,
  exactValueFromSuccessorInfo,
  listStateSuccessors
} from './game-ai-tablebase-core.js';

describe('game-ai-tablebase-core', () => {
  it('l orso preferisce una patta e poi massimizza la distanza', () => {
    const evaluation = evaluateBearTurnFromSuccessors([
      { outcome: 1, distance: 4 },
      { outcome: 0, distance: 2 },
      { outcome: 0, distance: 5 }
    ]);

    expect(evaluation).toEqual({
      outcome: 0,
      distance: 6,
      optimalSuccessorIndexes: [2]
    });
  });

  it('i cacciatori preferiscono una vittoria e poi minimizzano la distanza di cattura', () => {
    const evaluation = evaluateHuntersTurnFromSuccessors([
      { outcome: 0, distance: 9 },
      { outcome: 1, distance: 4 },
      { outcome: 1, distance: 1 }
    ]);

    expect(evaluation).toEqual({
      outcome: 1,
      distance: 2,
      optimalSuccessorIndexes: [2]
    });
  });

  it('mantiene esplicita la fallback a patta quando i cacciatori non hanno successori', () => {
    expect(evaluateHuntersTurnFromSuccessors([])).toEqual({
      outcome: 0,
      distance: 0,
      optimalSuccessorIndexes: []
    });
  });

  it('espone i successori legali completi del prossimo stato', () => {
    const bearState = {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 6,
      bear: 5,
      hunters: [0, 1, 3]
    };
    const hunterState = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 16,
      hunters: [17, 18, 8]
    };

    const bearSuccessors = listStateSuccessors(bearState);
    const hunterSuccessors = listStateSuccessors(hunterState);

    expect(bearSuccessors.map((successor) => successor.move.to)).toEqual([4, 6, 14, 17]);
    expect(bearSuccessors.map((successor) => successor.nextState.turn)).toEqual([
      'hunters',
      'hunters',
      'hunters',
      'hunters'
    ]);
    expect(hunterSuccessors.some((successor) => successor.move.from === 8 && successor.move.to === 19)).toBe(true);
    expect(exactValueFromSuccessorInfo({ outcome: 1, distance: 3 })).toEqual({
      outcome: 1,
      distance: 4
    });
  });
});
