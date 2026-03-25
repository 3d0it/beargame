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
  getRankedPlayingMoves,
  describeMoveQuality,
  deterministicChoiceIndex,
  isCriticalPlayingState,
  moveMatchesExactTop
} from './game-ai-solver.js';

describe('game-ai-solver', () => {
  it('encodes and decodes a canonical state', () => {
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

  it('immediately recognizes a terminal state with a trapped bear', () => {
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

  it('orders hunter moves to close access to the center', () => {
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

  it('precomputes deterministic rankings for hunter setup and bear opening positions', () => {
    const lunetteRanking = getRankedHunterLunettes();
    const bearStarts = getRankedBearStarts([1, 2, 3]);

    expect(lunetteRanking[0]?.lunette).toEqual([1, 2, 3]);
    expect(bearStarts[0]?.move.to).toBe(11);
    expect(bearStarts[0]?.distance).toBeGreaterThan(0);
  });

  it('covers solver fallbacks and utility branches', () => {
    expect(getRankedBearStarts([0, 1, 2])).toEqual([]);
    expect(deterministicChoiceIndex({
      phase: 'playing',
      turn: 'bear',
      bearMoves: 0,
      bear: 5,
      hunters: [1, 2, 3]
    }, 'easy', 1)).toBe(0);

    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 16,
      hunters: [17, 18, 8]
    };
    expect(moveMatchesExactTop(state, { hunterIndex: 2, from: 8, to: 19 })).toBe(true);
    expect(moveMatchesExactTop(state, { hunterIndex: 2, from: 8, to: 7 })).toBe(false);

    const quality = describeMoveQuality(state, { hunterIndex: 2, from: 8, to: 7 });
    expect(quality.best).not.toBeNull();
    expect(quality.chosen).not.toBeNull();
    expect(quality.bestOutcomeLabel).toBeTypeOf('string');
    expect(quality.chosenOutcomeLabel).toBeTypeOf('string');

    expect(isCriticalPlayingState(state, [], false)).toBe(false);
    expect(isCriticalPlayingState(state, getRankedPlayingMoves(state), true)).toBe(true);
  });

  it('rejects exact lookups on non-playing states and describes missing moves', () => {
    expect(() =>
      getExactStateInfo({
        phase: 'setup-bear',
        turn: 'bear',
        bearMoves: 0,
        bear: 5,
        hunters: [1, 2, 3]
      })
    ).toThrow(/non-playing state/);

    const quality = describeMoveQuality({
      phase: 'playing',
      turn: 'bear',
      bearMoves: 0,
      bear: 0,
      hunters: [1, 2, 3]
    }, { to: 99 });

    expect(quality.best).toBeNull();
    expect(quality.chosen).toBeNull();
    expect(quality.bestOutcomeLabel).toBeNull();
    expect(quality.chosenOutcomeLabel).toBeNull();
  });
});
