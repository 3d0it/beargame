import { describe, expect, it } from 'vitest';
import {
  evaluateBearTurnFromSuccessors,
  evaluateHuntersTurnFromSuccessors,
  exactValueFromSuccessorInfo,
  listStateSuccessors
} from './game-ai-tablebase-core.js';

describe('game-ai-tablebase-core', () => {
  it('the bear prefers a draw and then maximizes distance', () => {
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

  it('the hunters prefer a win and then minimize capture distance', () => {
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

  it('keeps the draw fallback explicit when the hunters have no successors', () => {
    expect(evaluateHuntersTurnFromSuccessors([])).toEqual({
      outcome: 0,
      distance: 0,
      optimalSuccessorIndexes: []
    });
  });

  it('exposes the full legal successors of the next state', () => {
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
