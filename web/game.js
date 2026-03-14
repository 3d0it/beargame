import {
  adjacency,
  applyVirtualMoveToState,
  BOARD_NODES,
  cloneGameState,
  EDGE_LIST,
  getBearLegalMovesForState,
  getHunterLegalMovesForState,
  HUNTER_LUNETTES,
  isOccupiedNode,
  nodeDistance,
  reachableCountForState
} from './game-state-helpers.js';
export { BOARD_NODES } from './game-state-helpers.js';
const GAME_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const HUNTERS_SETUP_HINT = 'I Cacciatori devono scegliere una lunetta iniziale.';
const BEAR_TURN_HINT = "Turno dell'Orso: seleziona una casella adiacente libera.";
const HUNTERS_TURN_HINT = 'Turno dei Cacciatori: seleziona un cacciatore, poi una casella adiacente libera.';
const HUNTER_SELECTED_HINT = 'Cacciatore selezionato: scegli una casella adiacente libera.';
const HUNTER_INVALID_MOVE_HINT = 'Mossa non valida: scegli una casella adiacente libera.';
const DIFFICULTY_CONFIG = {
  easy: { bearDepth: 1, hunterDepth: 1, setupDepth: 1, quiescenceDepth: 0, rolloutDepth: 0, rolloutWeight: 0, targetRating: 3 },
  medium: { bearDepth: 2, hunterDepth: 2, setupDepth: 1, quiescenceDepth: 0, rolloutDepth: 0, rolloutWeight: 0, targetRating: 5 },
  hard: { bearDepth: 8, hunterDepth: 5, setupDepth: 5, quiescenceDepth: 2, rolloutDepth: 5, rolloutWeight: 0.6, targetRating: 8 }
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

const NODE_IDS = new Set(BOARD_NODES.map((node) => node.id));

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
    message: HUNTERS_SETUP_HINT
  };
}

export function createGame(options = {}) {
  const enableBenchmarkTools = options.enableBenchmarkTools === true;
  let state = emptyState();
  let onChange = null;
  let matchEpoch = 0;
  let pendingComputerTurn = false;
  let recentPositionHashes = [];
  let recentMoves = [];

  function emitChange() {
    onChange?.();
  }

  function captureEpoch() {
    return matchEpoch;
  }

  function isCurrentEpoch(epoch) {
    return epoch === matchEpoch;
  }

  function positionHash(local = state) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.phase}|${local.turn}|${local.bear}|${hunters}`;
  }

  function resetRecentPositions() {
    recentPositionHashes = [];
  }

  function resetRecentMoves() {
    recentMoves = [];
  }

  function rememberPosition(local = state) {
    recentPositionHashes.push(positionHash(local));
    if (recentPositionHashes.length > 12) {
      recentPositionHashes = recentPositionHashes.slice(-12);
    }
  }

  function rememberMove(side, from, to) {
    recentMoves.push({ side, from, to });
    if (recentMoves.length > 12) {
      recentMoves = recentMoves.slice(-12);
    }
  }

  function repetitionPenalty(local) {
    const nextHash = positionHash(local);
    let penalty = 0;

    for (let i = recentPositionHashes.length - 1; i >= 0; i -= 1) {
      if (recentPositionHashes[i] !== nextHash) continue;
      const recency = recentPositionHashes.length - i;
      penalty += Math.max(0, 42 - recency * 6);
    }

    return penalty;
  }

  function moveBacktrackPenalty(side, move) {
    if (!move || typeof move.to !== 'number') return 0;
    const from = side === 'bear' ? state.bear : move.from;
    if (typeof from !== 'number') return 0;

    let penalty = 0;
    for (let i = recentMoves.length - 1; i >= 0; i -= 1) {
      const previous = recentMoves[i];
      if (previous.side !== side) continue;
      if (previous.from !== move.to || previous.to !== from) continue;
      const recency = recentMoves.length - i;
      penalty += Math.max(0, 56 - recency * 10);
      break;
    }

    return penalty;
  }

  function resolveDifficulty(nextDifficulty = 'easy') {
    return GAME_DIFFICULTIES.has(nextDifficulty) ? nextDifficulty : 'easy';
  }

  function isValidNodeId(nodeId) {
    return Number.isInteger(nodeId) && NODE_IDS.has(nodeId);
  }

  function isOccupied(nodeId, local = state) {
    return isOccupiedNode(local, nodeId);
  }

  function canMove(from, to, local = state) {
    if (!isValidNodeId(from) || !isValidNodeId(to)) return false;
    return adjacency.get(from).includes(to) && !isOccupied(to, local);
  }

  function getBearLegalMoves(local = state) {
    if (!isValidNodeId(local.bear)) return [];
    return getBearLegalMovesForState(local);
  }

  function getHunterLegalMoves(local = state) {
    return getHunterLegalMovesForState(local);
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

    startNextRound();
  }

  function startNextRound() {
    state.round += 1;
    state.hunters = [];
    state.bear = null;
    state.turn = 'hunters';
    state.selectedHunter = null;
    state.bearMoves = 0;
    state.phase = 'setup-hunters';
    state.message = HUNTERS_SETUP_HINT;
    resetRecentPositions();
    resetRecentMoves();
  }

  function applyBearMove(to) {
    if (!canMove(state.bear, to)) return false;
    const from = state.bear;
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
    state.message = HUNTERS_TURN_HINT;
    rememberMove('bear', from, to);
    rememberPosition();
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
    state.message = BEAR_TURN_HINT;
    rememberMove('hunters', from, to);
    rememberPosition();
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
    return cloneGameState(local);
  }

  function getDifficultyConfig() {
    return DIFFICULTY_CONFIG[state.difficulty] ?? DIFFICULTY_CONFIG.easy;
  }

  function getValidBearStartPositions(local = state) {
    const freeNodes = BOARD_NODES.map((node) => node.id).filter((nodeId) => !isOccupied(nodeId, local));
    return freeNodes.filter((nodeId) => {
      const simulated = cloneState(local);
      simulated.bear = nodeId;
      return getBearLegalMoves(simulated).length > 0;
    });
  }

  function reachableCount(local, start, maxDepth) {
    return reachableCountForState(local, start, maxDepth);
  }

  function hunterPressureProfile(local) {
    let trapReplies = 0;
    let squeezeReplies = 0;

    for (const move of getHunterLegalMoves(local)) {
      const afterHunter = applyVirtualMove(local, 'hunters', move);
      const mobilityAfter = getBearLegalMoves(afterHunter).length;
      if (mobilityAfter === 0) {
        trapReplies += 1;
      } else if (mobilityAfter === 1) {
        squeezeReplies += 1;
      }
    }

    return { trapReplies, squeezeReplies };
  }

  function bearEscapeProfile(local) {
    let safeRoutes = 0;
    let trapRoutes = 0;
    let squeezeRoutes = 0;
    let frontierReach = 0;

    for (const to of getBearLegalMoves(local)) {
      const afterBear = applyVirtualMove(local, 'bear', { to });
      frontierReach += reachableCount(afterBear, to, 4);
      const { trapReplies, squeezeReplies } = hunterPressureProfile(afterBear);

      if (trapReplies > 0) {
        trapRoutes += 1;
      } else if (squeezeReplies > 0) {
        squeezeRoutes += 1;
      } else {
        safeRoutes += 1;
      }
    }

    return { safeRoutes, trapRoutes, squeezeRoutes, frontierReach };
  }

  function immediateTrapCount(local) {
    let traps = 0;
    for (const move of getHunterLegalMoves(local)) {
      const afterHunter = applyVirtualMove(local, 'hunters', move);
      if (getBearLegalMoves(afterHunter).length === 0) traps += 1;
    }
    return traps;
  }

  function tacticalMoveScore(local, sideToMove, move) {
    const next = applyVirtualMove(local, sideToMove, move);
    const mobility = getBearLegalMoves(next).length;
    const reachable4 = reachableCount(next, next.bear, 4);
    const { trapReplies, squeezeReplies } = hunterPressureProfile(next);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(next);
    const immediateTraps = immediateTrapCount(next);

    if (sideToMove === 'bear') {
      return (
        safeRoutes * 420 +
        frontierReach * 22 +
        reachable4 * 14 +
        mobility * 160 -
        trapReplies * 1500 -
        immediateTraps * 1700 -
        squeezeReplies * 340 -
        trapRoutes * 620 -
        squeezeRoutes * 210
      );
    }

    return (
      immediateTraps * 1800 +
      trapRoutes * 520 +
      squeezeRoutes * 180 -
      safeRoutes * 360 -
      reachable4 * 24 -
      mobility * 240 -
      trapReplies * 60
    );
  }

  function isTacticalState(local) {
    const mobility = getBearLegalMoves(local).length;
    if (mobility <= 2) return true;
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local);
    if (trapReplies > 0 || squeezeReplies > 0) return true;
    const { trapRoutes, squeezeRoutes } = bearEscapeProfile(local);
    return trapRoutes > 0 || squeezeRoutes > 0;
  }

  function greedyRolloutScore(local, perspective, pliesRemaining) {
    let current = cloneState(local);
    let sideToMove = current.turn ?? perspective;

    for (let ply = 0; ply < pliesRemaining; ply += 1) {
      if (current.bear === null || current.bearMoves >= MAX_BEAR_MOVES || getBearLegalMoves(current).length === 0) {
        break;
      }

      const moves = legalMovesFor(sideToMove, current);
      if (moves.length === 0) break;

      const maximizing = sideToMove === perspective;
      let chosenMove = moves[0];
      let chosenScore = maximizing ? -Infinity : Infinity;

      for (const move of moves) {
        const next = applyVirtualMove(current, sideToMove, move);
        const score = evaluateState(next, perspective) + tacticalMoveScore(current, sideToMove, move);
        if (maximizing ? score > chosenScore : score < chosenScore) {
          chosenScore = score;
          chosenMove = move;
        }
      }

      current = applyVirtualMove(current, sideToMove, chosenMove);
      sideToMove = sideToMove === 'bear' ? 'hunters' : 'bear';
    }

    return evaluateState(current, perspective);
  }

  function selectTacticalMoveWithRollout(local, sideToMove, perspective, moves, rolloutDepth) {
    if (rolloutDepth <= 0 || moves.length === 0) return null;
    if (!isTacticalState(local)) return null;

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of moves) {
      const simulated = applyVirtualMove(local, sideToMove, move);
      const score =
        greedyRolloutScore(simulated, perspective, rolloutDepth) +
        tacticalMoveScore(local, sideToMove, move) -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty(sideToMove, move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
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
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(local);
    const mobilityDanger = mobility <= 1 ? 180 : mobility === 2 ? 80 : 0;

    // Higher score favors bear freedom; hunters maximize the inverse.
    const bearScore =
      mobility * 52 +
      twoStepMobility * 16 +
      reachable3 * 10 +
      safeAdjacents * 14 +
      safeRoutes * 42 +
      frontierReach * 5 +
      distanceSum * 0.7 -
      pressure * 140 -
      trapReplies * 90 -
      squeezeReplies * 26 -
      trapRoutes * 120 -
      squeezeRoutes * 55 -
      mobilityDanger -
      centerDistance * 0.5 -
      hunterAdjacency * 32;
    return perspective === 'bear' ? bearScore : -bearScore;
  }

  function applyVirtualMove(local, side, move) {
    return applyVirtualMoveToState(local, side, move);
  }

  function legalMovesFor(side, local) {
    if (side === 'bear') return getBearLegalMoves(local).map((to) => ({ to }));
    return getHunterLegalMoves(local);
  }

  function orderedMoves(local, sideToMove, perspective, maximizing) {
    const moves = legalMovesFor(sideToMove, local);
    return moves.sort((a, b) => {
      const stateA = applyVirtualMove(local, sideToMove, a);
      const stateB = applyVirtualMove(local, sideToMove, b);
      const scoreA =
        evaluateState(stateA, perspective) +
        tacticalMoveScore(local, sideToMove, a) -
        repetitionPenalty(stateA) -
        moveBacktrackPenalty(sideToMove, a);
      const scoreB =
        evaluateState(stateB, perspective) +
        tacticalMoveScore(local, sideToMove, b) -
        repetitionPenalty(stateB) -
        moveBacktrackPenalty(sideToMove, b);
      return maximizing ? scoreB - scoreA : scoreA - scoreB;
    });
  }

  function stateHash(local, depth, quiescenceDepth, sideToMove, perspective) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.bear}|${hunters}|${local.bearMoves}|${depth}|${quiescenceDepth}|${sideToMove}|${perspective}`;
  }

  function minimax(local, depth, quiescenceDepth, sideToMove, perspective, alpha, beta, transposition) {
    const bearMoves = getBearLegalMoves(local);
    const terminalBearTrapped = local.bear !== null && bearMoves.length === 0;
    if (terminalBearTrapped || local.bearMoves >= MAX_BEAR_MOVES) {
      return evaluateState(local, perspective);
    }

    if (depth === 0) {
      if (quiescenceDepth <= 0 || !isTacticalState(local)) {
        return evaluateState(local, perspective);
      }
      depth = 1;
      quiescenceDepth -= 1;
    }

    const key = stateHash(local, depth, quiescenceDepth, sideToMove, perspective);
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
          quiescenceDepth,
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
        quiescenceDepth,
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
    const quiescenceDepth = getDifficultyConfig().quiescenceDepth;
    const rolloutDepth = getDifficultyConfig().rolloutDepth;
    const rolloutWeight = getDifficultyConfig().rolloutWeight;
    const tacticalOverride = selectTacticalMoveWithRollout(state, 'bear', 'bear', moves.map((to) => ({ to })), rolloutDepth);
    if (tacticalOverride) return tacticalOverride.to;
    const effectiveDepth =
      state.difficulty === 'hard'
        ? depth +
          (moves.length <= 2 ? 2 : hunterPressureProfile(state).trapReplies > 0 ? 1 : 0)
        : depth;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const to of moves) {
      const simulated = applyVirtualMove(state, 'bear', { to });
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated)
          ? greedyRolloutScore(simulated, 'bear', rolloutDepth) * rolloutWeight
          : 0;
      const score =
        minimax(
          simulated,
          effectiveDepth - 1,
          quiescenceDepth,
          'hunters',
          'bear',
          -Infinity,
          Infinity,
          transposition
        ) +
        tacticalMoveScore(state, 'bear', { to }) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty('bear', { to });
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
    const quiescenceDepth = getDifficultyConfig().quiescenceDepth;
    const rolloutDepth = getDifficultyConfig().rolloutDepth;
    const rolloutWeight = getDifficultyConfig().rolloutWeight;
    const tacticalOverride = selectTacticalMoveWithRollout(state, 'hunters', 'hunters', moves, rolloutDepth);
    if (tacticalOverride) return tacticalOverride;
    const bearProfile = bearEscapeProfile(state);
    const effectiveDepth =
      state.difficulty === 'hard'
        ? depth + (bearProfile.safeRoutes <= 1 ? 1 : 0)
        : depth;
    let best = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const move of moves) {
      const simulated = applyVirtualMove(state, 'hunters', move);
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated)
          ? greedyRolloutScore(simulated, 'hunters', rolloutDepth) * rolloutWeight
          : 0;
      const score =
        minimax(
          simulated,
          effectiveDepth - 1,
          quiescenceDepth,
          'bear',
          'hunters',
          -Infinity,
          Infinity,
          transposition
        ) +
        tacticalMoveScore(state, 'hunters', move) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty('hunters', move);
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
    const validBearStarts = getValidBearStartPositions();
    if (validBearStarts.length === 0) {
      state.message = 'Orso bloccato in 0 mosse.';
      finishRound('hunters-win');
      return;
    }

    state.phase = 'setup-bear';
    state.turn = 'bear';
    state.message = "L'Orso sceglie una posizione iniziale.";
    rememberPosition();
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
      const quiescenceDepth = getDifficultyConfig().quiescenceDepth;
      const responseScore = minimax(
        simulated,
        depth,
        quiescenceDepth,
        'bear',
        'bear',
        -Infinity,
        Infinity,
        new Map()
      );
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
    const free = getValidBearStartPositions();
    if (free.length === 0) return null;
    let best = free[0];
    let bestScore = -Infinity;

    for (const pos of free) {
      const simulated = cloneState(state);
      simulated.bear = pos;
      let score = evaluateState(simulated, 'bear');

      if (state.difficulty !== 'easy') {
        const depth = getDifficultyConfig().setupDepth;
        const quiescenceDepth = getDifficultyConfig().quiescenceDepth;
        score = minimax(simulated, depth, quiescenceDepth, 'bear', 'bear', -Infinity, Infinity, new Map());
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
        state.message = 'Orso bloccato in 0 mosse.';
        finishRound('hunters-win');
        emitChange();
        return;
      }
      state.bear = chosen;
      state.phase = 'playing';
      state.turn = 'bear';
      state.message = BEAR_TURN_HINT;
      rememberPosition();
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

  function runComputerTurnSync() {
    if (state.phase === 'setup-hunters' && currentControllerFor('hunters') === 'computer') {
      computerChooseHuntersLunette();
      return true;
    }

    if (state.phase === 'setup-bear' && currentControllerFor('bear') === 'computer') {
      const chosen = chooseBearStartPosition();
      if (chosen === null) {
        state.message = 'Orso bloccato in 0 mosse.';
        finishRound('hunters-win');
        return true;
      }
      state.bear = chosen;
      state.phase = 'playing';
      state.turn = 'bear';
      state.message = BEAR_TURN_HINT;
      rememberPosition();
      computerBearMove();
      return true;
    }

    if (state.phase !== 'playing') return false;

    if (state.turn === 'bear' && currentControllerFor('bear') === 'computer') {
      computerBearMove();
      return true;
    }

    if (state.turn === 'hunters' && currentControllerFor('hunters') === 'computer') {
      computerHuntersMove();
      return true;
    }

    return false;
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
      if (!getValidBearStartPositions().includes(nodeId)) {
        state.message = "Posizione iniziale non valida: l'Orso deve avere almeno una mossa disponibile.";
        emitChange();
        return;
      }
      state.bear = nodeId;
      state.phase = 'playing';
      state.turn = 'bear';
      state.message = BEAR_TURN_HINT;
      rememberPosition();
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
        state.message = HUNTER_SELECTED_HINT;
        emitChange();
        return;
      }
      if (state.selectedHunter !== null) {
        const moved = applyHunterMove(state.selectedHunter, nodeId);
        if (moved) {
          emitChange();
          maybeComputerTurn();
          return;
        }
        state.message = HUNTER_INVALID_MOVE_HINT;
        emitChange();
        return;
      }
      state.message = HUNTERS_TURN_HINT;
      emitChange();
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
    resetRecentPositions();
    resetRecentMoves();
    state = emptyState();
    state.mode = mode;
    state.computerSide = computerSide;
    state.difficulty = resolveDifficulty(difficulty);
    emitChange();
    maybeComputerTurn();
  }

  function setStateForBenchmark(nextState) {
    const safeState = emptyState();
    safeState.mode = nextState.mode ?? 'hvc';
    safeState.computerSide = nextState.computerSide ?? 'bear';
    safeState.difficulty = resolveDifficulty(nextState.difficulty);
    safeState.round = Number.isInteger(nextState.round) ? nextState.round : 1;
    safeState.roundResults = [];
    safeState.lastRoundResult = null;
    safeState.matchSummary = null;
    safeState.hunters = Array.isArray(nextState.hunters) ? [...nextState.hunters] : [];
    safeState.bear = nextState.bear ?? null;
    safeState.turn = nextState.turn ?? 'bear';
    safeState.selectedHunter = null;
    safeState.bearMoves = Number.isInteger(nextState.bearMoves) ? nextState.bearMoves : 0;
    safeState.phase = nextState.phase ?? 'playing';
    safeState.message = typeof nextState.message === 'string' ? nextState.message : '';

    state = safeState;
    resetRecentPositions();
    resetRecentMoves();
    rememberPosition();
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

  const api = {
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

  if (enableBenchmarkTools) {
    api.benchmark = {
      setState: setStateForBenchmark,
      runComputerTurnSync
    };
  }

  return api;
}
