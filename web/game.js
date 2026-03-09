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
const GAME_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const DIFFICULTY_CONFIG = {
  easy: { bearDepth: 1, hunterDepth: 1, setupDepth: 1 },
  medium: { bearDepth: 4, hunterDepth: 3, setupDepth: 3 },
  hard: { bearDepth: 6, hunterDepth: 5, setupDepth: 4 }
};

const lunetteByNode = new Map();
for (const lunette of HUNTER_LUNETTES) {
  for (const nodeId of lunette) lunetteByNode.set(nodeId, lunette);
}
export const MAX_BEAR_MOVES = 40;

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
const NODE_IDS = new Set(BOARD_NODES.map((node) => node.id));
const NODE_BY_ID = new Map(BOARD_NODES.map((node) => [node.id, node]));

function emptyState() {
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
    message: 'I Cacciatori devono scegliere una lunetta iniziale.'
  };
}

export function createGame() {
  let state = emptyState();
  let onChange = null;
  let matchEpoch = 0;
  let pendingComputerTurn = false;

  function emitChange() {
    onChange?.();
  }

  function captureEpoch() {
    return matchEpoch;
  }

  function isCurrentEpoch(epoch) {
    return epoch === matchEpoch;
  }

  function resolveDifficulty(nextDifficulty = 'easy') {
    return GAME_DIFFICULTIES.has(nextDifficulty) ? nextDifficulty : 'easy';
  }

  function isValidNodeId(nodeId) {
    return Number.isInteger(nodeId) && NODE_IDS.has(nodeId);
  }

  function isOccupied(nodeId, local = state) {
    return local.bear === nodeId || local.hunters.includes(nodeId);
  }

  function canMove(from, to, local = state) {
    if (!isValidNodeId(from) || !isValidNodeId(to)) return false;
    return adjacency.get(from).includes(to) && !isOccupied(to, local);
  }

  function getBearLegalMoves(local = state) {
    if (!isValidNodeId(local.bear)) return [];
    return adjacency.get(local.bear).filter((to) => !isOccupied(to, local));
  }

  function getHunterLegalMoves(local = state) {
    const result = [];
    for (let i = 0; i < local.hunters.length; i += 1) {
      const from = local.hunters[i];
      if (!isValidNodeId(from)) continue;
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
    if (!Number.isInteger(hunterIndex) || hunterIndex < 0 || hunterIndex >= state.hunters.length) {
      return false;
    }
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

  function currentControllerFor(side) {
    return controllerFor({
      mode: state.mode,
      computerSide: state.computerSide,
      round: state.round,
      side
    });
  }

  function cloneState(local) {
    return {
      ...local,
      hunters: [...local.hunters]
    };
  }

  function getDifficultyConfig() {
    return DIFFICULTY_CONFIG[state.difficulty] ?? DIFFICULTY_CONFIG.easy;
  }

  function nodeDistance(a, b) {
    const nodeA = NODE_BY_ID.get(a);
    const nodeB = NODE_BY_ID.get(b);
    if (!nodeA || !nodeB) return 0;
    const dx = nodeA.x - nodeB.x;
    const dy = nodeA.y - nodeB.y;
    return Math.hypot(dx, dy);
  }

  function reachableCount(local, start, maxDepth) {
    if (start === null || start === undefined) return 0;
    const queue = [{ node: start, depth: 0 }];
    const visited = new Set([start]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= maxDepth) continue;

      for (const next of adjacency.get(current.node) ?? []) {
        if (visited.has(next) || local.hunters.includes(next)) continue;
        visited.add(next);
        queue.push({ node: next, depth: current.depth + 1 });
      }
    }

    return visited.size;
  }

  function evaluateState(local, perspective = 'bear') {
    const mobility = getBearLegalMoves(local).length;
    const trapped = local.bear !== null && mobility === 0;
    const escaped = local.bearMoves >= MAX_BEAR_MOVES;

    if (trapped) {
      const score = -250000 + local.bearMoves * 140;
      return perspective === 'bear' ? score : -score;
    }
    if (escaped) {
      const score = 250000 - local.bearMoves * 80;
      return perspective === 'bear' ? score : -score;
    }

    let distanceSum = 0;
    let pressure = 0;
    for (const hunter of local.hunters) {
      const dist = nodeDistance(local.bear, hunter);
      distanceSum += dist;
      pressure += 1 / Math.max(1, dist);
    }

    const centerDistance = nodeDistance(local.bear, 18);
    const hunterAdjacency = local.hunters.filter((hunter) => adjacency.get(local.bear)?.includes(hunter)).length;
    const twoStepMobility = getBearLegalMoves(local)
      .map((to) => {
        const simulated = cloneState(local);
        simulated.bear = to;
        return getBearLegalMoves(simulated).length;
      })
      .reduce((sum, value) => sum + value, 0);
    const reachable3 = reachableCount(local, local.bear, 3);
    const safeAdjacents = getBearLegalMoves(local).filter(
      (to) => !local.hunters.some((hunter) => adjacency.get(to)?.includes(hunter))
    ).length;

    // Higher score favors bear freedom; hunters maximize the inverse.
    const bearScore =
      mobility * 52 +
      twoStepMobility * 16 +
      reachable3 * 10 +
      safeAdjacents * 14 +
      distanceSum * 0.7 -
      pressure * 140 -
      centerDistance * 0.5 -
      hunterAdjacency * 32;
    return perspective === 'bear' ? bearScore : -bearScore;
  }

  function applyVirtualMove(local, side, move) {
    const next = cloneState(local);
    if (side === 'bear') {
      next.bear = move.to;
      next.bearMoves += 1;
      next.turn = 'hunters';
      return next;
    }

    next.hunters[move.hunterIndex] = move.to;
    next.turn = 'bear';
    return next;
  }

  function legalMovesFor(side, local) {
    if (side === 'bear') return getBearLegalMoves(local).map((to) => ({ to }));
    return getHunterLegalMoves(local);
  }

  function orderedMoves(local, sideToMove, perspective, maximizing) {
    const moves = legalMovesFor(sideToMove, local);
    return moves.sort((a, b) => {
      const scoreA = evaluateState(applyVirtualMove(local, sideToMove, a), perspective);
      const scoreB = evaluateState(applyVirtualMove(local, sideToMove, b), perspective);
      return maximizing ? scoreB - scoreA : scoreA - scoreB;
    });
  }

  function stateHash(local, depth, sideToMove, perspective) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.bear}|${hunters}|${local.bearMoves}|${depth}|${sideToMove}|${perspective}`;
  }

  function minimax(local, depth, sideToMove, perspective, alpha, beta, transposition) {
    const bearMoves = getBearLegalMoves(local);
    const terminalBearTrapped = local.bear !== null && bearMoves.length === 0;
    if (depth === 0 || terminalBearTrapped || local.bearMoves >= MAX_BEAR_MOVES) {
      return evaluateState(local, perspective);
    }

    const key = stateHash(local, depth, sideToMove, perspective);
    const cached = transposition.get(key);
    if (cached !== undefined) return cached;

    const maximizing = sideToMove === perspective;
    const moves = orderedMoves(local, sideToMove, perspective, maximizing);
    if (moves.length === 0) {
      return evaluateState(local, perspective);
    }

    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const next = applyVirtualMove(local, sideToMove, move);
        const score = minimax(
          next,
          depth - 1,
          sideToMove === 'bear' ? 'hunters' : 'bear',
          perspective,
          alpha,
          beta,
          transposition
        );
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (beta <= alpha) break;
      }
      transposition.set(key, best);
      return best;
    }

    let best = Infinity;
    for (const move of moves) {
      const next = applyVirtualMove(local, sideToMove, move);
      const score = minimax(
        next,
        depth - 1,
        sideToMove === 'bear' ? 'hunters' : 'bear',
        perspective,
        alpha,
        beta,
        transposition
      );
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    transposition.set(key, best);
    return best;
  }

  function chooseBearMoveByDifficulty() {
    const moves = getBearLegalMoves();
    if (moves.length === 0) return null;

    if (state.difficulty === 'easy') {
      let bestMove = moves[0];
      let bestScore = -Infinity;

      for (const to of moves) {
        const simulated = cloneState(state);
        simulated.bear = to;
        const hunterResponses = getHunterLegalMoves(simulated);
        let worstReply = Infinity;
        if (hunterResponses.length === 0) {
          worstReply = evaluateState(simulated, 'bear');
        } else {
          for (const reply of hunterResponses) {
            const afterReply = cloneState(simulated);
            afterReply.hunters[reply.hunterIndex] = reply.to;
            worstReply = Math.min(worstReply, evaluateState(afterReply, 'bear'));
          }
        }

        if (worstReply > bestScore) {
          bestScore = worstReply;
          bestMove = to;
        }
      }

      return bestMove;
    }

    const depth = getDifficultyConfig().bearDepth;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const to of moves) {
      const simulated = applyVirtualMove(state, 'bear', { to });
      const score = minimax(simulated, depth - 1, 'hunters', 'bear', -Infinity, Infinity, transposition);
      if (score > bestScore) {
        bestScore = score;
        bestMove = to;
      }
    }

    return bestMove;
  }

  function chooseHunterMoveByDifficulty() {
    const moves = getHunterLegalMoves();
    if (moves.length === 0) return null;

    if (state.difficulty === 'easy') {
      let best = moves[0];
      let bestScore = Infinity;

      for (const move of moves) {
        const simulated = cloneState(state);
        simulated.hunters[move.hunterIndex] = move.to;
        const score = getBearLegalMoves(simulated).length;
        if (score < bestScore) {
          bestScore = score;
          best = move;
        }
      }

      return best;
    }

    const depth = getDifficultyConfig().hunterDepth;
    let best = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const move of moves) {
      const simulated = applyVirtualMove(state, 'hunters', move);
      const score = minimax(simulated, depth - 1, 'bear', 'hunters', -Infinity, Infinity, transposition);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }

    return best;
  }

  function computerBearMove() {
    const bestMove = chooseBearMoveByDifficulty();
    if (bestMove === null) return;
    applyBearMove(bestMove);
  }

  function computerHuntersMove() {
    const best = chooseHunterMoveByDifficulty();
    if (!best) return;
    applyHunterMove(best.hunterIndex, best.to);
  }

  function chooseHuntersLunette(lunette) {
    state.hunters = [...lunette];
    state.selectedHunter = null;
    state.phase = 'setup-bear';
    state.turn = 'bear';
    state.message = "L'Orso sceglie una posizione iniziale.";
  }

  function scoreLunette(lunette) {
    let bearBestReply = -Infinity;

    for (const node of BOARD_NODES) {
      if (lunette.includes(node.id)) continue;
      const simulated = cloneState(state);
      simulated.hunters = [...lunette];
      simulated.bear = node.id;
      const immediate = evaluateState(simulated, 'bear');

      if (state.difficulty === 'easy') {
        bearBestReply = Math.max(bearBestReply, immediate);
        continue;
      }

      const depth = getDifficultyConfig().setupDepth;
      const responseScore = minimax(simulated, depth, 'bear', 'bear', -Infinity, Infinity, new Map());
      bearBestReply = Math.max(bearBestReply, responseScore);
    }

    return bearBestReply;
  }

  function computerChooseHuntersLunette() {
    let bestLunette = HUNTER_LUNETTES[0];
    let bestScore = Infinity;

    for (const lunette of HUNTER_LUNETTES) {
      const score = scoreLunette(lunette);
      if (score < bestScore) {
        bestScore = score;
        bestLunette = lunette;
      }
    }

    chooseHuntersLunette(bestLunette);
  }

  function chooseBearStartPosition() {
    const free = BOARD_NODES.map((n) => n.id).filter((id) => !isOccupied(id));
    if (free.length === 0) return null;
    let best = free[0];
    let bestScore = -Infinity;

    for (const pos of free) {
      const simulated = cloneState(state);
      simulated.bear = pos;
      let score = evaluateState(simulated, 'bear');

      if (state.difficulty !== 'easy') {
        const depth = getDifficultyConfig().setupDepth;
        score = minimax(simulated, depth, 'bear', 'bear', -Infinity, Infinity, new Map());
      }

      if (score > bestScore) {
        bestScore = score;
        best = pos;
      }
    }

    return best;
  }

  function scheduleComputerTurn(action) {
    if (pendingComputerTurn) return;
    pendingComputerTurn = true;
    const epoch = captureEpoch();
    setTimeout(() => {
      pendingComputerTurn = false;
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
      const chosen = chooseBearStartPosition();
      if (chosen === null) {
        state.hunters = [];
        state.bear = null;
        state.selectedHunter = null;
        state.phase = 'setup-hunters';
        state.turn = 'hunters';
        state.message = 'Stato non valido rilevato. I Cacciatori devono scegliere di nuovo una lunetta.';
        emitChange();
        return;
      }
      state.bear = chosen;
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
    if (!isValidNodeId(nodeId)) return;
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

  function setConfig(mode, computerSide, difficulty = 'easy') {
    state.mode = mode;
    state.computerSide = computerSide;
    state.difficulty = resolveDifficulty(difficulty);
    emitChange();
  }

  function newMatch(mode, computerSide, difficulty = 'easy') {
    matchEpoch += 1;
    pendingComputerTurn = false;
    state = emptyState();
    state.mode = mode;
    state.computerSide = computerSide;
    state.difficulty = resolveDifficulty(difficulty);
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
    adjacency,
    difficulties: ['easy', 'medium', 'hard']
  };
}
