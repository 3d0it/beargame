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
import { createAiEngine } from './game-ai.js';
import { DIFFICULTY_CONFIG, AI_HEURISTIC_PROFILE } from './game-ai-profile.js';
import { createEmptyGameState, summarizeMatch } from './game-match.js';
import { controllerFor, createMatchOrchestrator } from './game-match-orchestrator.js';
import { createRulesEngine } from './game-rules-engine.js';
import { TURN_HINT_CODES, VALIDATION_ERROR_CODES } from './game-state-codes.js';
import { createAiTurnScheduler } from './game-turn-scheduler.js';

export { BOARD_NODES } from './game-state-helpers.js';
export { summarizeMatch } from './game-match.js';
export { controllerFor } from './game-match-orchestrator.js';

const GAME_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const HUNTERS_SETUP_HINT = 'I Cacciatori devono scegliere una lunetta iniziale.';
const BEAR_TURN_HINT = "Turno dell'Orso: seleziona una casella adiacente libera.";
const HUNTERS_TURN_HINT = 'Turno dei Cacciatori: seleziona un cacciatore, poi una casella adiacente libera.';
const HUNTER_SELECTED_HINT = 'Cacciatore selezionato: scegli una casella adiacente libera.';
const HUNTER_INVALID_MOVE_HINT = 'Mossa non valida: scegli una casella adiacente libera.';

const lunetteByNode = new Map();
for (const lunette of HUNTER_LUNETTES) {
  for (const nodeId of lunette) lunetteByNode.set(nodeId, lunette);
}

export const MAX_BEAR_MOVES = 40;

const NODE_IDS = new Set(BOARD_NODES.map((node) => node.id));

function emptyState() {
  return createEmptyGameState(HUNTERS_SETUP_HINT);
}

export function createGame(options = {}) {
  const enableBenchmarkTools = options.enableBenchmarkTools === true;
  const stateRef = { current: emptyState() };
  let onChange = null;
  let recentPositionHashes = [];
  let recentMoves = [];
  let recentResponsePatterns = [];

  function emitChange() {
    onChange?.();
  }

  function positionHash(local = stateRef.current) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.phase}|${local.turn}|${local.bear}|${hunters}`;
  }

  function resetRecentPositions() {
    recentPositionHashes = [];
  }

  function resetRecentMoves() {
    recentMoves = [];
  }

  function resetRecentResponsePatterns() {
    recentResponsePatterns = [];
  }

  function rememberPosition(local = stateRef.current) {
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

  function rememberResponsePattern(side, before, after) {
    recentResponsePatterns.push({
      side,
      before: positionHash(before),
      after: positionHash(after)
    });
    if (recentResponsePatterns.length > 12) {
      recentResponsePatterns = recentResponsePatterns.slice(-12);
    }
  }

  function repetitionPenalty(local) {
    const nextHash = positionHash(local);
    let penalty = 0;

    for (let i = recentPositionHashes.length - 1; i >= 0; i -= 1) {
      if (recentPositionHashes[i] !== nextHash) continue;
      const recency = recentPositionHashes.length - i;
      penalty += Math.max(0, AI_HEURISTIC_PROFILE.antiLoop.repetitionBase - recency * AI_HEURISTIC_PROFILE.antiLoop.repetitionRecencyStep);
    }

    return penalty;
  }

  function moveBacktrackPenalty(side, move) {
    if (!move || typeof move.to !== 'number') return 0;

    const state = stateRef.current;
    const from = side === 'bear' ? state.bear : move.from;
    if (typeof from !== 'number') return 0;

    let penalty = 0;
    for (let i = recentMoves.length - 1; i >= 0; i -= 1) {
      const previous = recentMoves[i];
      if (previous.side !== side) continue;
      if (previous.from !== move.to || previous.to !== from) continue;
      const recency = recentMoves.length - i;
      penalty += Math.max(
        0,
        AI_HEURISTIC_PROFILE.antiLoop.moveBacktrackBase - recency * AI_HEURISTIC_PROFILE.antiLoop.moveBacktrackRecencyStep
      );
      break;
    }

    return penalty;
  }

  function responseLoopPenalty(side, before, after) {
    if (!before || !after) return 0;

    const beforeHash = positionHash(before);
    const afterHash = positionHash(after);
    let penalty = 0;

    for (let i = recentResponsePatterns.length - 1; i >= 0; i -= 1) {
      const previous = recentResponsePatterns[i];
      if (previous.side !== side) continue;
      if (previous.before !== beforeHash || previous.after !== afterHash) continue;
      const recency = recentResponsePatterns.length - i;
      penalty += Math.max(
        0,
        AI_HEURISTIC_PROFILE.antiLoop.responseLoopBase - recency * AI_HEURISTIC_PROFILE.antiLoop.responseLoopRecencyStep
      );
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

  function isOccupied(nodeId, local = stateRef.current) {
    return isOccupiedNode(local, nodeId);
  }

  function cloneState(local) {
    return cloneGameState(local);
  }

  function getBearLegalMoves(local = stateRef.current) {
    if (!isValidNodeId(local.bear)) return [];
    return getBearLegalMovesForState(local);
  }

  function getHunterLegalMoves(local = stateRef.current) {
    return getHunterLegalMovesForState(local);
  }

  function isBearTrapped(local = stateRef.current) {
    return local.bear !== null && getBearLegalMoves(local).length === 0;
  }

  function getDifficultyConfig() {
    return DIFFICULTY_CONFIG[stateRef.current.difficulty] ?? DIFFICULTY_CONFIG.easy;
  }

  function getValidBearStartPositions(local = stateRef.current) {
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

  function setAiThinking(thinking, side = null) {
    const state = stateRef.current;
    state.aiThinking = thinking;
    state.aiThinkingSide = thinking ? side : null;
  }

  const match = createMatchOrchestrator({
    stateRef,
    createEmptyState: emptyState,
    resolveDifficulty,
    setupMessage: HUNTERS_SETUP_HINT,
    emitChange,
    resetRecentPositions,
    resetRecentMoves,
    resetRecentResponsePatterns,
    rememberPosition,
    setAiThinking
  });

  const rules = createRulesEngine({
    stateRef,
    adjacency,
    cloneState,
    isValidNodeId,
    isOccupied,
    getBearLegalMoves,
    getValidBearStartPositions,
    isBearTrapped,
    rememberMove,
    rememberPosition,
    rememberResponsePattern,
    finishRound: match.finishRound,
    maxBearMoves: MAX_BEAR_MOVES,
    hints: {
      bearTurn: BEAR_TURN_HINT,
      huntersTurn: HUNTERS_TURN_HINT
    }
  });

  const ai = createAiEngine({
    adjacency,
    maxBearMoves: MAX_BEAR_MOVES,
    cloneState,
    nodeDistance,
    reachableCount,
    getBearLegalMoves,
    getHunterLegalMoves,
    applyVirtualMove: applyVirtualMoveToState,
    repetitionPenalty,
    moveBacktrackPenalty,
    responseLoopPenalty
  });

  function computerBearMove() {
    const state = stateRef.current;
    const bestMove = ai.chooseBearMove(state, state.difficulty, getDifficultyConfig());
    if (bestMove === null) return;
    rules.applyBearMove(bestMove);
  }

  function computerHuntersMove() {
    const state = stateRef.current;
    const best = ai.chooseHunterMove(state, state.difficulty, getDifficultyConfig());
    if (!best) return;
    rules.applyHunterMove(best.hunterIndex, best.to);
  }

  function scoreLunette(lunette) {
    const state = stateRef.current;
    return ai.scoreLunette(state, lunette, state.difficulty, getDifficultyConfig(), BOARD_NODES);
  }

  function isSymmetricOpeningSetup(local = stateRef.current) {
    return (
      local.phase === 'setup-hunters' &&
      local.bear === null &&
      Array.isArray(local.hunters) &&
      local.hunters.length === 0 &&
      local.bearMoves === 0
    );
  }

  function computerChooseHuntersLunette() {
    if (isSymmetricOpeningSetup()) {
      rules.chooseHuntersLunette(HUNTER_LUNETTES[0]);
      return;
    }

    let bestLunette = HUNTER_LUNETTES[0];
    let bestScore = Infinity;

    for (const lunette of HUNTER_LUNETTES) {
      const score = scoreLunette(lunette);
      if (score < bestScore) {
        bestScore = score;
        bestLunette = lunette;
      }
    }

    rules.chooseHuntersLunette(bestLunette);
  }

  function chooseBearStartPosition() {
    const state = stateRef.current;
    const free = getValidBearStartPositions();
    return ai.chooseBearStartPosition(state, state.difficulty, getDifficultyConfig(), free);
  }

  const scheduler = createAiTurnScheduler({
    emitChange,
    setAiThinking,
    captureEpoch: match.captureEpoch,
    isCurrentEpoch: match.isCurrentEpoch
  });

  function maybeComputerTurn() {
    const state = stateRef.current;
    if (state.phase !== 'playing' && state.phase !== 'setup-bear' && state.phase !== 'setup-hunters') return;

    if (state.phase === 'setup-hunters' && match.currentControllerFor('hunters') === 'computer') {
      scheduler.schedule(() => {
        computerChooseHuntersLunette();
        maybeComputerTurn();
      }, 'hunters');
      return;
    }

    if (state.phase === 'setup-bear' && match.currentControllerFor('bear') === 'computer') {
      const chosen = chooseBearStartPosition();
      if (chosen === null) {
        state.message = 'Orso bloccato in 0 mosse.';
        state.turnHintCode = TURN_HINT_CODES.MATCH_OVER;
        state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
        match.finishRound('hunters-win');
        emitChange();
        return;
      }

      rules.setBearStartPosition(chosen);
      emitChange();
      scheduler.schedule(() => {
        computerBearMove();
        maybeComputerTurn();
      }, 'bear');
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.turn === 'bear' && match.currentControllerFor('bear') === 'computer') {
      scheduler.schedule(() => {
        computerBearMove();
        maybeComputerTurn();
      }, 'bear');
      return;
    }

    if (state.turn === 'hunters' && match.currentControllerFor('hunters') === 'computer') {
      scheduler.schedule(() => {
        computerHuntersMove();
        maybeComputerTurn();
      }, 'hunters');
    }
  }

  function runComputerTurnSync() {
    const state = stateRef.current;

    if (state.phase === 'setup-hunters' && match.currentControllerFor('hunters') === 'computer') {
      computerChooseHuntersLunette();
      return true;
    }

    if (state.phase === 'setup-bear' && match.currentControllerFor('bear') === 'computer') {
      const chosen = chooseBearStartPosition();
      if (chosen === null) {
        state.message = 'Orso bloccato in 0 mosse.';
        state.turnHintCode = TURN_HINT_CODES.MATCH_OVER;
        state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
        match.finishRound('hunters-win');
        return true;
      }
      rules.setBearStartPosition(chosen);
      computerBearMove();
      return true;
    }

    if (state.phase !== 'playing') return false;

    if (state.turn === 'bear' && match.currentControllerFor('bear') === 'computer') {
      computerBearMove();
      return true;
    }

    if (state.turn === 'hunters' && match.currentControllerFor('hunters') === 'computer') {
      computerHuntersMove();
      return true;
    }

    return false;
  }

  function clickNode(nodeId) {
    const state = stateRef.current;
    if (!isValidNodeId(nodeId)) return;
    if (state.phase === 'match-over' || state.phase === 'tie-after-two-rounds') return;

    if (state.phase === 'setup-hunters') {
      if (match.currentControllerFor('hunters') === 'computer') return;
      const lunette = lunetteByNode.get(nodeId);
      if (!lunette) return;
      rules.chooseHuntersLunette(lunette);
      emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.phase === 'setup-bear') {
      if (match.currentControllerFor('bear') === 'computer') return;
      if (isOccupied(nodeId)) return;
      if (!getValidBearStartPositions().includes(nodeId)) {
        state.message = "Posizione iniziale non valida: l'Orso deve avere almeno una mossa disponibile.";
        state.turnHintCode = TURN_HINT_CODES.BEAR_SETUP;
        state.validationErrorCode = VALIDATION_ERROR_CODES.BEAR_INVALID_START;
        emitChange();
        return;
      }
      rules.setBearStartPosition(nodeId);
      emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.turn === 'bear') {
      if (match.currentControllerFor('bear') === 'computer') return;
      const moved = rules.applyBearMove(nodeId);
      if (moved) emitChange();
      maybeComputerTurn();
      return;
    }

    if (state.turn === 'hunters') {
      if (match.currentControllerFor('hunters') === 'computer') return;
      const hunterIndex = state.hunters.indexOf(nodeId);
      if (hunterIndex !== -1) {
        state.selectedHunter = hunterIndex;
        state.message = HUNTER_SELECTED_HINT;
        state.turnHintCode = TURN_HINT_CODES.HUNTER_SELECTED;
        state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
        emitChange();
        return;
      }

      if (state.selectedHunter !== null) {
        const moved = rules.applyHunterMove(state.selectedHunter, nodeId);
        if (moved) {
          emitChange();
          maybeComputerTurn();
          return;
        }
        state.message = HUNTER_INVALID_MOVE_HINT;
        state.turnHintCode = TURN_HINT_CODES.HUNTER_SELECTED;
        state.validationErrorCode = VALIDATION_ERROR_CODES.HUNTER_INVALID_MOVE;
        emitChange();
        return;
      }

      state.message = HUNTERS_TURN_HINT;
      state.turnHintCode = TURN_HINT_CODES.HUNTERS_TURN;
      state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
      emitChange();
    }
  }

  function newMatch(mode, computerSide, difficulty = 'easy') {
    scheduler.reset();
    match.newMatch(mode, computerSide, difficulty);
    maybeComputerTurn();
  }

  function setOnChange(cb) {
    onChange = cb;
  }

  const api = {
    getState: match.getState,
    clickNode,
    newMatch,
    setConfig: match.setConfig,
    setOnChange,
    hunterLunettes: HUNTER_LUNETTES,
    edges: EDGE_LIST,
    adjacency,
    difficulties: ['easy', 'medium', 'hard']
  };

  if (enableBenchmarkTools) {
    api.benchmark = {
      setState: match.setStateForBenchmark,
      runComputerTurnSync
    };
  }

  return api;
}
