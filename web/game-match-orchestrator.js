import {
  applyFinishedMatchState,
  createRoundResult,
  resetStateForNextRound,
  summarizeMatch
} from './game-match.js';

export function controllerFor({ mode, computerSide, round, side }) {
  if (mode === 'hvh') return 'human';

  const computerControlsBear =
    round % 2 === 1 ? computerSide === 'bear' : computerSide !== 'bear';

  if (side === 'bear') {
    return computerControlsBear ? 'computer' : 'human';
  }

  return computerControlsBear ? 'human' : 'computer';
}

export function createMatchOrchestrator({
  stateRef,
  createEmptyState,
  resolveDifficulty,
  setupMessage,
  emitChange,
  resetRecentPositions,
  resetRecentMoves,
  resetRecentResponsePatterns,
  rememberPosition,
  setAiThinking
}) {
  let matchEpoch = 0;

  function captureEpoch() {
    return matchEpoch;
  }

  function isCurrentEpoch(epoch) {
    return epoch === matchEpoch;
  }

  function currentControllerFor(side) {
    const state = stateRef.current;
    return controllerFor({
      mode: state.mode,
      computerSide: state.computerSide,
      round: state.round,
      side
    });
  }

  function startNextRound() {
    resetStateForNextRound(stateRef.current, setupMessage);
    resetRecentPositions();
    resetRecentMoves();
    resetRecentResponsePatterns();
  }

  function finishRound(reason) {
    const state = stateRef.current;
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

  function setConfig(mode, computerSide, difficulty = 'easy') {
    const state = stateRef.current;
    state.mode = mode;
    state.computerSide = computerSide;
    state.difficulty = resolveDifficulty(difficulty);
    emitChange();
  }

  function newMatch(mode, computerSide, difficulty = 'easy') {
    matchEpoch += 1;
    resetRecentPositions();
    resetRecentMoves();
    resetRecentResponsePatterns();
    stateRef.current = createEmptyState();
    setAiThinking(false);
    stateRef.current.mode = mode;
    stateRef.current.computerSide = computerSide;
    stateRef.current.difficulty = resolveDifficulty(difficulty);
    emitChange();
  }

  function setStateForBenchmark(nextState) {
    const safeState = createEmptyState();
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

    stateRef.current = safeState;
    resetRecentPositions();
    resetRecentMoves();
    resetRecentResponsePatterns();
    rememberPosition();
  }

  function getState() {
    const state = stateRef.current;
    return {
      ...state,
      hunters: [...state.hunters],
      roundResults: state.roundResults.map((result) => ({ ...result })),
      lastRoundResult: state.lastRoundResult ? { ...state.lastRoundResult } : null,
      matchSummary: state.matchSummary ? { ...state.matchSummary } : null
    };
  }

  return {
    captureEpoch,
    currentControllerFor,
    finishRound,
    getState,
    isCurrentEpoch,
    newMatch,
    setConfig,
    setStateForBenchmark
  };
}
