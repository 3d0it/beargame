import { MAX_BEAR_MOVES } from '../web/game.js';
import {
  adjacency,
  applyVirtualMoveToState,
  cloneGameState,
  getBearLegalMovesForState,
  getHunterLegalMovesForState,
  nodeDistance,
  reachableCountForState
} from '../web/game-state-helpers.js';

export function cloneState(state) {
  return cloneGameState(state);
}

export function getBearLegalMoves(state) {
  return getBearLegalMovesForState(state);
}

export function getHunterLegalMoves(state) {
  return getHunterLegalMovesForState(state);
}

export function applyBearMove(state, to) {
  return applyVirtualMoveToState(state, 'bear', { to });
}

export function applyHunterMove(state, move) {
  return applyVirtualMoveToState(state, 'hunters', move);
}

export function applyMove(state, move) {
  return state.turn === 'bear' ? applyBearMove(state, move.to) : applyHunterMove(state, move);
}

export function legalMoves(state) {
  return state.turn === 'bear'
    ? getBearLegalMoves(state).map((to) => ({ to }))
    : getHunterLegalMoves(state);
}

export function moveLabel(state, move) {
  return state.turn === 'bear'
    ? `orso ${state.bear} -> ${move.to}`
    : `cacciatore[${move.hunterIndex}] ${move.from} -> ${move.to}`;
}

export function isBearTrapped(state) {
  return state.bear !== null && getBearLegalMoves(state).length === 0;
}

export function reachableCount(state, start, maxDepth) {
  return reachableCountForState(state, start, maxDepth);
}

export function hunterPressureProfile(state) {
  let trapReplies = 0;
  let squeezeReplies = 0;

  for (const move of getHunterLegalMoves(state)) {
    const next = applyHunterMove(state, move);
    const mobilityAfter = getBearLegalMoves(next).length;
    if (mobilityAfter === 0) trapReplies += 1;
    else if (mobilityAfter === 1) squeezeReplies += 1;
  }

  return { trapReplies, squeezeReplies };
}

export function bearEscapeProfile(state) {
  let safeRoutes = 0;
  let trapRoutes = 0;
  let squeezeRoutes = 0;

  for (const to of getBearLegalMoves(state)) {
    const afterBear = applyBearMove(state, to);
    const { trapReplies, squeezeReplies } = hunterPressureProfile(afterBear);
    if (trapReplies > 0) trapRoutes += 1;
    else if (squeezeReplies > 0) squeezeRoutes += 1;
    else safeRoutes += 1;
  }

  return { safeRoutes, trapRoutes, squeezeRoutes };
}

export function strategicScore(state, perspective) {
  if (isBearTrapped(state)) {
    const huntersScore = 100000 - state.bearMoves * 400;
    return perspective === 'hunters' ? huntersScore : -huntersScore;
  }
  if (state.bearMoves >= MAX_BEAR_MOVES) {
    const bearScore = 100000 - state.bearMoves * 150;
    return perspective === 'bear' ? bearScore : -bearScore;
  }

  const mobility = getBearLegalMoves(state).length;
  const { trapReplies, squeezeReplies } = hunterPressureProfile(state);
  const { safeRoutes, trapRoutes, squeezeRoutes } = bearEscapeProfile(state);
  const reachable3 = reachableCount(state, state.bear, 3);
  const avgHunterDistance =
    state.hunters.length === 0
      ? 0
      : state.hunters.reduce((sum, hunter) => sum + nodeDistance(state.bear, hunter), 0) / state.hunters.length;

  const bearScore =
    mobility * 70 +
    reachable3 * 18 +
    safeRoutes * 80 -
    trapReplies * 130 -
    squeezeReplies * 45 -
    trapRoutes * 100 -
    squeezeRoutes * 40 +
    avgHunterDistance * 3.5 +
    (MAX_BEAR_MOVES - state.bearMoves) * 2;

  return perspective === 'bear' ? bearScore : -bearScore;
}

export function chooseGreedyMove(state) {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const perspective = state.turn;
  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const score = strategicScore(next, perspective);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

export function rolloutScore(startState, perspective, plies) {
  let current = cloneState(startState);
  for (let ply = 0; ply < plies; ply += 1) {
    if (isBearTrapped(current) || current.bearMoves >= MAX_BEAR_MOVES) break;
    const move = chooseGreedyMove(current);
    if (!move) break;
    current = applyMove(current, move);
  }
  return strategicScore(current, perspective);
}

export { adjacency, nodeDistance };
