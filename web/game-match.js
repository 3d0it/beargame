export function summarizeMatch(results) {
  const r1 = results[0];
  const r2 = results[1];
  if (!r1 || !r2) {
    return { isTie: false, winnerPlayer: null, message: 'Partita in corso' };
  }

  const p1AsHunters = r1.huntersPlayer === 'player-1' ? r1 : r2;
  const p2AsHunters = r1.huntersPlayer === 'player-2' ? r1 : r2;
  const p1Win = p1AsHunters.reason === 'hunters-win';
  const p2Win = p2AsHunters.reason === 'hunters-win';

  if (p1Win && !p2Win) {
    return {
      isTie: false,
      winnerPlayer: 'player-1',
      message: 'Partita conclusa: vince player-1.'
    };
  }

  if (p2Win && !p1Win) {
    return {
      isTie: false,
      winnerPlayer: 'player-2',
      message: 'Partita conclusa: vince player-2.'
    };
  }

  if (p1Win && p2Win) {
    if (p1AsHunters.immobilizationMoves < p2AsHunters.immobilizationMoves) {
      return {
        isTie: false,
        winnerPlayer: 'player-1',
        message: 'Partita conclusa: vince player-1.'
      };
    }
    if (p2AsHunters.immobilizationMoves < p1AsHunters.immobilizationMoves) {
      return {
        isTie: false,
        winnerPlayer: 'player-2',
        message: 'Partita conclusa: vince player-2.'
      };
    }
  }

  return {
    isTie: true,
    winnerPlayer: null,
    message: 'Risultato finale: parità dopo due manche. Premi Nuova partita per lo spareggio.'
  };
}

export function createEmptyGameState(setupMessage) {
  return {
    mode: 'hvh',
    computerSide: 'bear',
    difficulty: 'easy',
    round: 1,
    roundResults: [],
    lastRoundResult: null,
    matchSummary: null,
    hunters: [],
    bear: null,
    turn: 'hunters',
    selectedHunter: null,
    bearMoves: 0,
    phase: 'setup-hunters',
    message: setupMessage
  };
}

export function createRoundResult(state, reason) {
  return {
    round: state.round,
    reason,
    immobilizationMoves: reason === 'hunters-win' ? state.bearMoves : null,
    bearPlayer: state.round % 2 === 1 ? 'player-1' : 'player-2',
    huntersPlayer: state.round % 2 === 1 ? 'player-2' : 'player-1'
  };
}

export function resetStateForNextRound(state, setupMessage) {
  state.round += 1;
  state.hunters = [];
  state.bear = null;
  state.turn = 'hunters';
  state.selectedHunter = null;
  state.bearMoves = 0;
  state.phase = 'setup-hunters';
  state.message = setupMessage;
}

export function applyFinishedMatchState(state, summary) {
  state.matchSummary = summary;
  state.phase = summary.isTie ? 'tie-after-two-rounds' : 'match-over';
  state.message = summary.message;
  state.turn = null;
}
