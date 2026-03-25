import {
  AI_DISTANCE_BASE64,
  AI_OUTCOME_BASE64,
  AI_SETUP_BEAR_START_RANKINGS,
  AI_SETUP_HUNTER_LUNETTE_RANKING,
  AI_TABLE_SIGNATURE
} from './game-ai-table.js';
import {
  AI_OUTCOMES,
  AI_TURNS,
  canonicalBoardSignature,
  compareHardCandidates,
  describePlayingMoveCandidates,
  hashStringFnv1a,
  isCentralContestState,
  isImmediateEscapeState,
  isImmediateTrapState,
  moveCodeFor,
  outcomeLabel,
  scoreStyleForState,
  stateIndexForState,
  terminalInfoForState
} from './game-ai-model.js';
import { getBearLegalMovesForState, sortHunters } from './game-state-helpers.js';

let outcomeTable = null;
let distanceTable = null;

export { AI_OUTCOMES, AI_TABLE_SIGNATURE };

export function getExactStateInfo(state) {
  const terminal = terminalInfoForState(state);
  if (terminal) return terminal;

  const stateIndex = stateIndexForState(state);
  if (stateIndex < 0) {
    throw new Error(`Exact AI lookup received a non-playing state: ${canonicalBoardSignature(state)}`);
  }

  ensureTables();
  return {
    outcome: outcomeTable[stateIndex],
    distance: distanceTable[stateIndex]
  };
}

export function getRankedPlayingMoves(state) {
  return describePlayingMoveCandidates(state, getExactStateInfo);
}

export function getRankedBearStarts(hunters) {
  const key = sortHunters(hunters).join(',');
  const rankedStarts = AI_SETUP_BEAR_START_RANKINGS[key] ?? [];

  return rankedStarts.map((bear) => {
    const state = {
      hunters: sortHunters(hunters),
      bear,
      bearMoves: 0,
      turn: AI_TURNS.bear,
      phase: 'playing'
    };
    const exact = getExactStateInfo(state);
    return {
      move: { to: bear },
      moveCode: `start:${bear}`,
      outcome: exact.outcome,
      distance: exact.distance,
      styleScore: scoreStyleForState(state, AI_TURNS.bear),
      state
    };
  });
}

export function getRankedHunterLunettes() {
  return AI_SETUP_HUNTER_LUNETTE_RANKING.map((lunette) => {
    const bestBearReply = getRankedBearStarts(lunette)[0];
    return {
      lunette: [...lunette],
      moveCode: `setup:${lunette.join('-')}`,
      outcome: bestBearReply.outcome,
      distance: bestBearReply.distance,
      styleScore: bestBearReply ? -bestBearReply.styleScore : 0,
      bestBearReply
    };
  }).sort((left, right) => compareHardCandidates(left, right, AI_TURNS.hunters));
}

export function isCriticalPlayingState(state, rankedCandidates = getRankedPlayingMoves(state), historyRisk = false) {
  if (historyRisk) return true;
  if (rankedCandidates.length === 0) return false;
  const mobility = state.bear === null ? 0 : getBearLegalMovesForState(state).length;
  if (mobility <= 2) return true;
  if (state.turn === AI_TURNS.hunters && isImmediateTrapState(state)) return true;
  if (state.turn === AI_TURNS.bear && isImmediateEscapeState(state, getExactStateInfo)) return true;
  if (isCentralContestState(state)) return true;
  const bestOutcome = rankedCandidates[0].outcome;
  return rankedCandidates.some((candidate) => candidate.outcome !== bestOutcome);
}

export function deterministicChoiceIndex(state, difficulty, size) {
  if (size <= 1) return 0;
  const seed = hashStringFnv1a(`${difficulty}|${canonicalBoardSignature(state)}`);
  return seed % size;
}

export function moveMatchesExactTop(state, move) {
  const top = getRankedPlayingMoves(state)[0];
  if (!top) return false;
  return top.moveCode === moveCodeFor(state.turn, move);
}

export function describeMoveQuality(state, move) {
  const ranked = getRankedPlayingMoves(state);
  const moveCode = moveCodeFor(state.turn, move);
  const best = ranked[0] ?? null;
  const chosen = ranked.find((candidate) => candidate.moveCode === moveCode) ?? null;

  return {
    ranked,
    best,
    chosen,
    bestOutcomeLabel: best ? outcomeLabel(best.outcome) : null,
    chosenOutcomeLabel: chosen ? outcomeLabel(chosen.outcome) : null
  };
}

function ensureTables() {
  if (outcomeTable && distanceTable) return;

  outcomeTable = decodeBase64Bytes(AI_OUTCOME_BASE64);
  distanceTable = decodeBase64Bytes(AI_DISTANCE_BASE64);
}

function decodeBase64Bytes(value) {
  if (typeof Uint8Array.fromBase64 === 'function') {
    return Uint8Array.fromBase64(value);
  }

  if (typeof atob === 'function') {
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      bytes[index] = decoded.charCodeAt(index);
    }
    return bytes;
  }

  const decoded = Buffer.from(value, 'base64');
  return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
}
