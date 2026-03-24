import { describe, expect, it } from 'vitest';
import {
  createAiEngine,
  DIFFICULTY_POLICY_CONFIG
} from './game-ai-policy.js';
import { createHistoryTracker } from '../scripts/ai-tools.mjs';

function createEngine() {
  return createAiEngine({ history: createHistoryTracker() });
}

describe('game-ai-policy', () => {
  it('hard sceglie sempre la prima mossa esatta disponibile', () => {
    const engine = createEngine();
    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 16,
      hunters: [17, 18, 8]
    };

    const ranked = engine.rankPlayingMoves(state);
    const chosen = engine.chooseHunterMove(state, 'hard', DIFFICULTY_POLICY_CONFIG.hard);

    expect(ranked[0]?.moveCode).toBe('h:8-19');
    expect(chosen).toEqual({ hunterIndex: 2, from: 8, to: 19 });
  });

  it('medium ed easy restano deterministici e dentro la finestra concessa', () => {
    const engine = createEngine();
    const state = {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 6,
      bear: 5,
      hunters: [0, 1, 3]
    };

    const ranked = engine.rankPlayingMoves(state).map((candidate) => candidate.moveCode);
    const easyA = engine.chooseBearMove(state, 'easy', DIFFICULTY_POLICY_CONFIG.easy);
    const easyB = engine.chooseBearMove(state, 'easy', DIFFICULTY_POLICY_CONFIG.easy);
    const medium = engine.chooseBearMove(state, 'medium', DIFFICULTY_POLICY_CONFIG.medium);

    expect(easyA).toEqual(easyB);
    expect(ranked.slice(0, 4)).toContain(`b:${easyA?.to}`);
    expect(ranked.slice(0, 2)).toContain(`b:${medium?.to}`);
    expect(medium?.to).toBe(14);
  });

  it('in stato critico medium ed easy collassano sulla scelta hard', () => {
    const engine = createEngine();
    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 5,
      bear: 5,
      hunters: [2, 17, 20]
    };

    const easy = engine.chooseHunterMove(state, 'easy', DIFFICULTY_POLICY_CONFIG.easy);
    const medium = engine.chooseHunterMove(state, 'medium', DIFFICULTY_POLICY_CONFIG.medium);
    const hard = engine.chooseHunterMove(state, 'hard', DIFFICULTY_POLICY_CONFIG.hard);

    expect(easy).toEqual(hard);
    expect(medium).toEqual(hard);
  });

  it('evita l undo immediato quando esiste un alternativa valida', () => {
    const history = createHistoryTracker();
    const engine = createAiEngine({ history });
    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 18,
      hunters: [16, 19, 20]
    };

    history.rememberPosition(state);
    history.rememberMove('hunters', { from: 17, to: 16 }, { bear: 18 });

    for (const difficulty of ['easy', 'medium', 'hard']) {
      const chosen = engine.chooseHunterMove(state, difficulty, DIFFICULTY_POLICY_CONFIG[difficulty]);
      expect(chosen).not.toEqual({ hunterIndex: 0, from: 16, to: 17 });
    }
  });

  it('evita di ripetere la stessa risposta quando la sequenza e gia nota', () => {
    const history = createHistoryTracker();
    const engine = createAiEngine({ history });
    const state = {
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 8,
      bear: 18,
      hunters: [16, 17, 19]
    };

    history.rememberPosition(state);
    history.rememberResponsePattern('hunters', state, {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 8,
      bear: 18,
      hunters: [16, 19, 20]
    });

    for (const difficulty of ['easy', 'medium', 'hard']) {
      const chosen = engine.chooseHunterMove(state, difficulty, DIFFICULTY_POLICY_CONFIG[difficulty]);
      expect(chosen).not.toEqual({ hunterIndex: 1, from: 17, to: 20 });
    }
  });
});
