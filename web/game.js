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
import { createAiEngine, DIFFICULTY_CONFIG } from './game-ai.js';
import {
  applyFinishedMatchState,
  createEmptyGameState,
  createRoundResult,
  resetStateForNextRound,
  summarizeMatch
} from './game-match.js';
export { BOARD_NODES } from './game-state-helpers.js';
export { summarizeMatch } from './game-match.js';
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

export function controllerFor({ mode, computerSide, round, side }) {
  if (mode === 'hvh') return 'human';
  const computerControlsBear =
    round % 2 === 1 ? computerSide === 'bear' : computerSide !== 'bear';
  if (side === 'bear') {
    return computerControlsBear ? 'computer' : 'human';
  }
  return computerControlsBear ? 'human' : 'computer';
}

const NODE_IDS = new Set(BOARD_NODES.map((node) => node.id));

function emptyState() {
  return createEmptyGameState(HUNTERS_SETUP_HINT);
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
    const roundResult = createRoundResult(state, reason);
    state.roundResults.push(roundResult);
    state.lastRoundResult = roundResult;

    if (state.round >= 2) {
      const summary = summarizeMatch(state.roundResults);
      applyFinishedMatchState(state, summary);
      return;
    }

    startNextRound();
  }

  function startNextRound() {
    resetStateForNextRound(state, HUNTERS_SETUP_HINT);
    resetRecentPositions();
    resetRecentMoves();
  }

  function setAiThinking(thinking, side = null) {
    state.aiThinking = thinking;
    state.aiThinkingSide = thinking ? side : null;
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
    moveBacktrackPenalty
  });

  function computerBearMove() {
    const bestMove = ai.chooseBearMove(state, state.difficulty, getDifficultyConfig());
    if (bestMove === null) return;
    applyBearMove(bestMove);
  }

  function computerHuntersMove() {
    const best = ai.chooseHunterMove(state, state.difficulty, getDifficultyConfig());
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
    return ai.scoreLunette(state, lunette, state.difficulty, getDifficultyConfig(), BOARD_NODES);
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
    return ai.chooseBearStartPosition(state, state.difficulty, getDifficultyConfig(), free);
  }

  function scheduleComputerTurn(action, side) {
    if (pendingComputerTurn) return;
    pendingComputerTurn = true;
    setAiThinking(true, side);
    emitChange();
    const epoch = captureEpoch();
    setTimeout(() => {
      pendingComputerTurn = false;
      setAiThinking(false);
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
      }, 'hunters');
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
      }, 'bear');
      return;
    }

    if (state.phase !== 'playing') return;

    if (state.turn === 'bear' && currentControllerFor('bear') === 'computer') {
      scheduleComputerTurn(() => {
        computerBearMove();
      }, 'bear');
      return;
    }

    if (state.turn === 'hunters' && currentControllerFor('hunters') === 'computer') {
      scheduleComputerTurn(() => {
        computerHuntersMove();
      }, 'hunters');
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
    setAiThinking(false);
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
    safeState.aiThinking = false;
    safeState.aiThinkingSide = null;
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
