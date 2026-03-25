import { describe, expect, it } from 'vitest';
import {
  applyFinishedMatchState,
  createEmptyGameState,
  createRoundResult,
  resetStateForNextRound,
  summarizeMatch
} from './game-match.js';

describe('game-match', () => {
  it('reports a match in progress if there are not enough results', () => {
    expect(summarizeMatch([])).toEqual({
      isTie: false,
      winnerPlayer: null,
      message: 'Partita in corso'
    });
  });

  it('chooses the correct winner when only one hunter side wins', () => {
    expect(summarizeMatch([
      { huntersPlayer: 'player-1', reason: 'hunters-win', immobilizationMoves: 10 },
      { huntersPlayer: 'player-2', reason: 'draw', immobilizationMoves: null }
    ])).toEqual({
      isTie: false,
      winnerPlayer: 'player-1',
      message: 'Partita conclusa: vince player-1.'
    });

    expect(summarizeMatch([
      { huntersPlayer: 'player-1', reason: 'draw', immobilizationMoves: null },
      { huntersPlayer: 'player-2', reason: 'hunters-win', immobilizationMoves: 8 }
    ])).toEqual({
      isTie: false,
      winnerPlayer: 'player-2',
      message: 'Partita conclusa: vince player-2.'
    });
  });

  it('resolves the immobilization-move tiebreak and handles draws', () => {
    expect(summarizeMatch([
      { huntersPlayer: 'player-1', reason: 'hunters-win', immobilizationMoves: 7 },
      { huntersPlayer: 'player-2', reason: 'hunters-win', immobilizationMoves: 9 }
    ])).toEqual({
      isTie: false,
      winnerPlayer: 'player-1',
      message: 'Partita conclusa: vince player-1.'
    });

    expect(summarizeMatch([
      { huntersPlayer: 'player-1', reason: 'hunters-win', immobilizationMoves: 9 },
      { huntersPlayer: 'player-2', reason: 'hunters-win', immobilizationMoves: 7 }
    ])).toEqual({
      isTie: false,
      winnerPlayer: 'player-2',
      message: 'Partita conclusa: vince player-2.'
    });

    expect(summarizeMatch([
      { huntersPlayer: 'player-1', reason: 'hunters-win', immobilizationMoves: 9 },
      { huntersPlayer: 'player-2', reason: 'hunters-win', immobilizationMoves: 9 }
    ])).toEqual({
      isTie: true,
      winnerPlayer: null,
      message: 'Risultato finale: parità dopo due manche. Premi Nuova partita per lo spareggio.'
    });
  });

  it('creates and resets match state correctly', () => {
    const state = createEmptyGameState('Setup iniziale');

    expect(state.phase).toBe('setup-hunters');
    expect(state.turn).toBe('hunters');

    state.round = 1;
    state.hunters = [1, 2, 3];
    state.bear = 11;
    state.selectedHunter = 0;
    state.bearMoves = 12;
    state.phase = 'playing';
    state.message = 'In corso';

    resetStateForNextRound(state, 'Nuovo setup');

    expect(state.round).toBe(2);
    expect(state.hunters).toEqual([]);
    expect(state.bear).toBeNull();
    expect(state.turn).toBe('hunters');
    expect(state.selectedHunter).toBeNull();
    expect(state.bearMoves).toBe(0);
    expect(state.phase).toBe('setup-hunters');
    expect(state.message).toBe('Nuovo setup');
  });

  it('builds round results and final state for match-over and tie cases', () => {
    const oddRoundState = { round: 1, bearMoves: 6 };
    const evenRoundState = { round: 2, bearMoves: 11 };

    expect(createRoundResult(oddRoundState, 'hunters-win')).toEqual({
      round: 1,
      reason: 'hunters-win',
      immobilizationMoves: 6,
      bearPlayer: 'player-1',
      huntersPlayer: 'player-2'
    });
    expect(createRoundResult(evenRoundState, 'draw')).toEqual({
      round: 2,
      reason: 'draw',
      immobilizationMoves: null,
      bearPlayer: 'player-2',
      huntersPlayer: 'player-1'
    });

    const matchOverState = createEmptyGameState('Setup');
    applyFinishedMatchState(matchOverState, {
      isTie: false,
      winnerPlayer: 'player-1',
      message: 'Conclusa'
    });
    expect(matchOverState.phase).toBe('match-over');
    expect(matchOverState.turn).toBeNull();

    const tieState = createEmptyGameState('Setup');
    applyFinishedMatchState(tieState, {
      isTie: true,
      winnerPlayer: null,
      message: 'Parita'
    });
    expect(tieState.phase).toBe('tie-after-two-rounds');
    expect(tieState.turn).toBeNull();
  });
});
