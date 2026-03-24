import { describe, expect, it } from 'vitest';
import {
  decodeStateIndex,
  stateIndexForState,
  terminalInfoForState
} from './game-ai-model.js';
import {
  getExactStateInfo,
  getRankedBearStarts,
  getRankedHunterLunettes,
  getRankedPlayingMoves
} from './game-ai-solver.js';

describe('game-ai-solver', () => {
  it('codifica e decodifica uno stato canonico', () => {
    const state = {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 6,
      bear: 5,
      hunters: [0, 1, 3]
    };

    const decoded = decodeStateIndex(stateIndexForState(state));

    expect(decoded?.turn).toBe('bear');
    expect(decoded?.bearMoves).toBe(6);
    expect(decoded?.bear).toBe(5);
    expect(decoded?.hunters).toEqual([0, 1, 3]);
  });

  it('riconosce immediatamente uno stato terminale con orso bloccato', () => {
    const state = {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 4,
      bear: 0,
      hunters: [1, 2, 3]
    };

    expect(terminalInfoForState(state)).toEqual({
      outcome: 1,
      distance: 0
    });
    expect(getExactStateInfo(state)).toEqual({
      outcome: 1,
      distance: 0
    });
  });

  it('ordina le mosse dei cacciatori per chiudere l accesso al centro', () => {
    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 16,
      hunters: [17, 18, 8]
    };

    const ranked = getRankedPlayingMoves(state);
    expect(ranked[0]?.moveCode).toBe('h:8-19');
  });

  it('precalcola ranking deterministico per setup cacciatori e partenza orso', () => {
    const lunetteRanking = getRankedHunterLunettes();
    const bearStarts = getRankedBearStarts([1, 2, 3]);

    expect(lunetteRanking[0]?.lunette).toEqual([1, 2, 3]);
    expect(bearStarts[0]?.move.to).toBe(11);
    expect(bearStarts[0]?.distance).toBeGreaterThan(0);
  });
});
