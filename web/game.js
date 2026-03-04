export const BOARD_NODES = [
  { id: 0, x: 50, y: 7 },
  { id: 1, x: 28.5, y: 12.8 },
  { id: 2, x: 50, y: 22 },
  { id: 3, x: 71.5, y: 12.8 },
  { id: 4, x: 12.8, y: 28.5 },
  { id: 5, x: 22, y: 50 },
  { id: 6, x: 12.8, y: 71.5 },
  { id: 7, x: 87.2, y: 28.5 },
  { id: 8, x: 78, y: 50 },
  { id: 9, x: 87.2, y: 71.5 },
  { id: 10, x: 28.5, y: 87.2 },
  { id: 11, x: 50, y: 78 },
  { id: 12, x: 71.5, y: 87.2 },
  { id: 13, x: 50, y: 93 },
  { id: 14, x: 7, y: 50 },
  { id: 15, x: 93, y: 50 },
  { id: 16, x: 50, y: 35 },
  { id: 17, x: 35, y: 50 },
  { id: 18, x: 50, y: 50 },
  { id: 19, x: 65, y: 50 },
  { id: 20, x: 50, y: 65 }
];

const EDGE_LIST = [
  [0, 3], [3, 7], [7, 15], [15, 9], [9, 12], [12, 13],
  [13, 10], [10, 6], [6, 14], [14, 4], [4, 1], [1, 0],
  [1, 2], [2, 3],
  [10, 11], [11, 12],
  [4, 5], [5, 6],
  [7, 8], [8, 9],
  [0, 2], [2, 16], [16, 18], [18, 20], [20, 11], [11, 13],
  [14, 5], [5, 17], [17, 18], [18, 19], [19, 8], [8, 15],
  [16, 19], [19, 20], [20, 17], [17, 16]
];

const HUNTER_LUNETTES = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12]
];
const lunetteByNode = new Map();
for (const lunette of HUNTER_LUNETTES) {
  for (const nodeId of lunette) lunetteByNode.set(nodeId, lunette);
}
const MAX_BEAR_MOVES = 40;

export function controllerFor({ mode, computerSide, round, side }) {
  if (mode === 'hvh') return 'human';
  const computerControlsBear =
    round % 2 === 1 ? computerSide === 'bear' : computerSide !== 'bear';
  if (side === 'bear') {
    return computerControlsBear ? 'computer' : 'human';
  }
  return computerControlsBear ? 'human' : 'computer';
}

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

const adjacency = new Map();
for (const node of BOARD_NODES) adjacency.set(node.id, []);
for (const [a, b] of EDGE_LIST) {
  adjacency.get(a).push(b);
  adjacency.get(b).push(a);
}

function emptyState() {
  return {
    mode: 'hvh',
    computerSide: 'bear',
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
    message: 'I Cacciatori devono scegliere una lunetta iniziale.'
  };
}

export function createGame() {
  let state = emptyState();
  let onChange = null;
  let matchEpoch = 0;

  function emitChange() {
    onChange?.();
  }

  function captureEpoch() {
    return matchEpoch;
  }

  function isCurrentEpoch(epoch) {
    return epoch === matchEpoch;
  }

  function isOccupied(nodeId, local = state) {
    return local.bear === nodeId || local.hunters.includes(nodeId);
  }

  function canMove(from, to, local = state) {
    return adjacency.get(from).includes(to) && !isOccupied(to, local);
  }

  function getBearLegalMoves(local = state) {
    if (local.bear === null) return [];
    return adjacency.get(local.bear).filter((to) => !isOccupied(to, local));
  }

  function getHunterLegalMoves(local = state) {
    const result = [];
    for (let i = 0; i < local.hunters.length; i += 1) {
      const from = local.hunters[i];
      for (const to of adjacency.get(from)) {
        if (!isOccupied(to, local)) {
          result.push({ hunterIndex: i, from, to });
        }
      }
    }
    return result;
  }

  function isBearTrapped(local = state) {
    return local.bear !== null && getBearLegalMoves(local).length === 0;
  }

  function finishRound(reason) {
    const roundResult = {
      round: state.round,
      reason,
      immobilizationMoves: reason === 'hunters-win' ? state.bearMoves : null,
      bearPlayer: state.round % 2 === 1 ? 'player-1' : 'player-2',
      huntersPlayer: state.round % 2 === 1 ? 'player-2' : 'player-1'
    };
    state.roundResults.push(roundResult);
    state.lastRoundResult = roundResult;

    if (state.round >= 2) {
      const summary = summarizeMatch(state.roundResults);
      state.matchSummary = summary;
      state.phase = summary.isTie ? 'tie-after-two-rounds' : 'match-over';
      state.message = summary.message;
      state.turn = null;
      return;
    }

    startNextRound(roundResult);
  }

  function startNextRound(previousRoundResult) {
    state.round += 1;
    state.hunters = [];
    state.bear = null;
    state.turn = 'hunters';
    state.selectedHunter = null;
    state.bearMoves = 0;
    state.phase = 'setup-hunters';
    state.message = `${describeRoundResult(previousRoundResult)} Inizia la manche ${state.round}: i Cacciatori scelgono una lunetta iniziale.`;
  }

  function describeRoundResult(roundResult) {
    if (!roundResult) return '';
    if (roundResult.reason === 'hunters-win') {
      return `Manche ${roundResult.round} conclusa: i Cacciatori vincono, Orso bloccato in ${roundResult.immobilizationMoves} mosse.`;
    }
    return `Manche ${roundResult.round} conclusa: patta, Orso non immobilizzato entro 40 mosse.`;
  }

  function applyBearMove(to) {
    if (!canMove(state.bear, to)) return false;
    state.bear = to;
    state.bearMoves += 1;
    if (isBearTrapped()) {
      state.message = `Orso bloccato in ${state.bearMoves} mosse.`;
      finishRound('hunters-win');
      return true;
    }
    if (state.bearMoves >= MAX_BEAR_MOVES) {
      state.message = "L'Orso non è stato immobilizzato entro 40 mosse: manche patta.";
      finishRound('draw');
      return true;
    }
    state.turn = 'hunters';
    state.message = 'Turno dei Cacciatori.';
    return true;
  }

  function applyHunterMove(hunterIndex, to) {
    const from = state.hunters[hunterIndex];
    if (!canMove(from, to)) return false;
    state.hunters[hunterIndex] = to;
    state.selectedHunter = null;

    if (isBearTrapped()) {
      state.message = `Orso bloccato in ${state.bearMoves} mosse.`;
      finishRound('hunters-win');
      return true;
    }

    state.turn = 'bear';
    state.message = "Turno dell'Orso.";
    return true;
  }

  function getCurrentBearSide() {
    return state.round % 2 === 1 ? 'player-1' : 'player-2';
  }

  function currentControllerFor(side) {
    return controllerFor({
      mode: state.mode,
      computerSide: state.computerSide,
      round: state.round,
      side
    });
  }

  function evaluateState(local) {
    const mobility = getBearLegalMoves(local).length;
    const trappedPenalty = mobility === 0 ? -100 : 0;
    return mobility * 8 + trappedPenalty;
  }

  function cloneState(local) {
    return {
      ...local,
      hunters: [...local.hunters]
    };
  }

  function computerBearMove() {
    const moves = getBearLegalMoves();
    if (moves.length === 0) return;
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const to of moves) {
      const simulated = cloneState(state);
      simulated.bear = to;
      const hunterResponses = getHunterLegalMoves(simulated);
      let worstReply = Infinity;
      if (hunterResponses.length === 0) {
        worstReply = evaluateState(simulated);
      } else {
        for (const reply of hunterResponses) {
          const afterReply = cloneState(simulated);
          afterReply.hunters[reply.hunterIndex] = reply.to;
          worstReply = Math.min(worstReply, evaluateState(afterReply));
        }
      }

      if (worstReply > bestScore) {
        bestScore = worstReply;
        bestMove = to;
      }
    }

    applyBearMove(bestMove);
  }

  function computerHuntersMove() {
    const moves = getHunterLegalMoves();
    if (moves.length === 0) return;
    let best = moves[0];
    let bestScore = Infinity;

    for (const move of moves) {
      const simulated = cloneState(state);
      simulated.hunters[move.hunterIndex] = move.to;
      const mobility = getBearLegalMoves(simulated).length;
      const score = mobility;
      if (score < bestScore) {
        bestScore = score;
        best = move;
      }
    }

    applyHunterMove(best.hunterIndex, best.to);
  }

  function chooseHuntersLunette(lunette) {
    state.hunters = [...lunette];
    state.selectedHunter = null;
    state.phase = 'setup-bear';
    state.turn = 'bear';
    state.message = "L'Orso sceglie una posizione iniziale.";
  }

  function computerChooseHuntersLunette() {
    let bestLunette = HUNTER_LUNETTES[0];
    let bestScore = Infinity;

    for (const lunette of HUNTER_LUNETTES) {
      let bearBestReply = -Infinity;
      for (const node of BOARD_NODES) {
        if (lunette.includes(node.id)) continue;
        const simulated = cloneState(state);
        simulated.hunters = [...lunette];
        simulated.bear = node.id;
        bearBestReply = Math.max(bearBestReply, evaluateState(simulated));
      }
      if (bearBestReply < bestScore) {
        bestScore = bearBestReply;
        bestLunette = lunette;
      }
    }

    chooseHuntersLunette(bestLunette);
  }

  function scheduleComputerTurn(action) {
    const epoch = captureEpoch();
    setTimeout(() => {
      if (!isCurrentEpoch(epoch)) return;
      action();
      if (!isCurrentEpoch(epoch)) return;
      emitChange();
      maybeComputerTurn();
    }, 250);
  }

  function maybeComputerTurn() {
    if (state.phase !== 'playing' && state.phase !== 'setup-bear' && state.phase !== 'setup-hunters') return;

    if (state.phase === 'setup-hunters' && currentControllerFor('hunters') === 'computer') {
      scheduleComputerTurn(() => {
        computerChooseHuntersLunette();
      });
      return;
    }

    if (state.phase === 'setup-bear' && currentControllerFor('bear') === 'computer') {
      const free = BOARD_NODES.map((n) => n.id).filter((id) => !isOccupied(id));
      let best = free[0];
      let bestScore = -Infinity;
      for (const pos of free) {
        const simulated = cloneState(state);
        simulated.bear = pos;
        const score = evaluateState(simulated);
        if (score > bestScore) {
          bestScore = score;
          best = pos;
        }
      }
      state.bear = best;
      state.phase = 'playing';
      state.turn = 'bear';
      state.message = "Turno dell'Orso.";
      emitChange();
      scheduleComputerTurn(() => {
        computerBearMove();
      });
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.turn === 'bear' && currentControllerFor('bear') === 'computer') {
      scheduleComputerTurn(() => {
        computerBearMove();
      });
      return;
    }

    if (state.turn === 'hunters' && currentControllerFor('hunters') === 'computer') {
      scheduleComputerTurn(() => {
        computerHuntersMove();
      });
    }
  }

  function clickNode(nodeId) {
    if (state.phase === 'match-over' || state.phase === 'tie-after-two-rounds') return;

    if (state.phase === 'setup-hunters') {
      if (currentControllerFor('hunters') === 'computer') return;
      const lunette = lunetteByNode.get(nodeId);
      if (!lunette) return;
      chooseHuntersLunette(lunette);
      emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.phase === 'setup-bear') {
      if (currentControllerFor('bear') === 'computer') return;
      if (isOccupied(nodeId)) return;
      state.bear = nodeId;
      state.phase = 'playing';
      state.turn = 'bear';
      state.message = "Turno dell'Orso.";
      emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.turn === 'bear') {
      if (currentControllerFor('bear') === 'computer') return;
      const moved = applyBearMove(nodeId);
      if (moved) emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.turn === 'hunters') {
      if (currentControllerFor('hunters') === 'computer') return;
      const hunterIndex = state.hunters.indexOf(nodeId);
      if (hunterIndex !== -1) {
        state.selectedHunter = hunterIndex;
        emitChange();
        return;
      }
      if (state.selectedHunter !== null) {
        const moved = applyHunterMove(state.selectedHunter, nodeId);
        if (moved) emitChange();
        maybeComputerTurn();
      }
    }
  }

  function setConfig(mode, computerSide) {
    state.mode = mode;
    state.computerSide = computerSide;
    emitChange();
  }

  function newMatch(mode, computerSide) {
    matchEpoch += 1;
    state = emptyState();
    state.mode = mode;
    state.computerSide = computerSide;
    emitChange();
    maybeComputerTurn();
  }

  function setOnChange(cb) {
    onChange = cb;
  }

  function getState() {
    return {
      ...state,
      hunters: [...state.hunters],
      roundResults: state.roundResults.map((result) => ({ ...result })),
      lastRoundResult: state.lastRoundResult ? { ...state.lastRoundResult } : null,
      matchSummary: state.matchSummary ? { ...state.matchSummary } : null
    };
  }

  return {
    getState,
    clickNode,
    newMatch,
    setConfig,
    setOnChange,
    hunterLunettes: HUNTER_LUNETTES,
    edges: EDGE_LIST,
    adjacency
  };
}
