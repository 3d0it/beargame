import {
  AI_TURNS,
  compareHardCandidates,
  distanceLossFromBest,
  moverOutcomeRank
} from './game-ai-model.js';
import {
  deterministicChoiceIndex,
  getExactStateInfo,
  getRankedBearStarts,
  getRankedHunterLunettes,
  getRankedPlayingMoves,
  isCriticalPlayingState
} from './game-ai-solver.js';

export const HARD_POLICY_CONFIG = Object.freeze({
  sameOutcomeOnly: true,
  maxOutcomeDrop: 0,
  distanceSlack: 0,
  topK: 1,
  criticalOverride: true
});

export const DIFFICULTY_POLICY_CONFIG = Object.freeze({
  easy: {
    sameOutcomeOnly: false,
    maxOutcomeDrop: 1,
    distanceSlack: 2,
    topK: 3,
    criticalOverride: true
  },
  medium: {
    sameOutcomeOnly: true,
    maxOutcomeDrop: 0,
    distanceSlack: 2,
    topK: 2,
    criticalOverride: true
  },
  hard: HARD_POLICY_CONFIG
});

export const POLICY_PARAMETER_GRID = Object.freeze({
  medium: Object.freeze({
    sameOutcomeOnly: [true],
    maxOutcomeDrop: [0],
    distanceSlack: [1, 2],
    topK: [2, 3],
    criticalOverride: [true]
  }),
  easy: Object.freeze({
    sameOutcomeOnly: [false],
    maxOutcomeDrop: [1],
    distanceSlack: [2, 3, 4],
    topK: [3, 4, 5],
    criticalOverride: [true]
  })
});

export function createAiEngine({ history } = {}) {
  const historyApi = history ?? createNoopHistoryApi();

  function rankPlayingMoves(state) {
    return annotateLoopRisk(state, getRankedPlayingMoves(state), historyApi);
  }

  function chooseBearMove(state, difficulty = 'hard', policyConfig = DIFFICULTY_POLICY_CONFIG[difficulty]) {
    const ranked = rankPlayingMoves(state);
    const chosen = chooseCandidateForState(state, ranked, AI_TURNS.bear, difficulty, policyConfig, historyApi);
    return chosen?.move ?? null;
  }

  function chooseHunterMove(state, difficulty = 'hard', policyConfig = DIFFICULTY_POLICY_CONFIG[difficulty]) {
    const ranked = rankPlayingMoves(state);
    const chosen = chooseCandidateForState(state, ranked, AI_TURNS.hunters, difficulty, policyConfig, historyApi);
    return chosen?.move ?? null;
  }

  function chooseBearStartPosition(state, difficulty = 'hard', policyConfig = DIFFICULTY_POLICY_CONFIG[difficulty], freeNodes = null) {
    const ranked = getRankedBearStarts(state.hunters)
      .filter((candidate) => !freeNodes || freeNodes.includes(candidate.move.to));
    const chosen = chooseCandidateForState(
      state,
      ranked,
      AI_TURNS.bear,
      difficulty,
      policyConfig,
      createNoopHistoryApi()
    );
    return chosen?.move.to ?? null;
  }

  function chooseHunterLunette(state, difficulty = 'hard', policyConfig = DIFFICULTY_POLICY_CONFIG[difficulty]) {
    const ranked = getRankedHunterLunettes();
    const chosen = chooseCandidateForState(
      state,
      ranked,
      AI_TURNS.hunters,
      difficulty,
      policyConfig,
      createNoopHistoryApi()
    );
    return chosen?.lunette ?? null;
  }

  return {
    chooseBearMove,
    chooseHunterMove,
    chooseBearStartPosition,
    chooseHunterLunette,
    getExactStateInfo,
    rankPlayingMoves
  };
}

export function chooseCandidateForState(state, rankedCandidates, mover, difficulty, policyConfig, historyApi) {
  if (!rankedCandidates || rankedCandidates.length === 0) return null;

  if (difficulty === 'hard') return rankedCandidates[0];

  const historyRisk = historyApi.hasLoopRisk?.(state) ?? false;
  const critical = policyConfig.criticalOverride && isCriticalPlayingState(state, rankedCandidates, historyRisk);
  if (critical) return rankedCandidates[0];

  const best = rankedCandidates[0];
  let allowed = rankedCandidates.filter((candidate) => isAllowedCandidate(candidate, best, mover, policyConfig));
  if (allowed.length === 0) allowed = [best];

  const loopSafe = allowed.filter((candidate) => !candidate.loopRisk);
  if (loopSafe.length > 0) {
    allowed = loopSafe;
  }

  const limited = allowed.slice(0, Math.max(1, policyConfig.topK));
  const choiceIndex = choosePolicyIndex(limited, state, difficulty);
  return limited[choiceIndex] ?? limited[0];
}

export function isAllowedCandidate(candidate, best, mover, policyConfig) {
  if (policyConfig.sameOutcomeOnly && candidate.outcome !== best.outcome) {
    return false;
  }

  const bestRank = moverOutcomeRank(best.outcome, mover);
  const candidateRank = moverOutcomeRank(candidate.outcome, mover);
  if (bestRank - candidateRank > policyConfig.maxOutcomeDrop) {
    return false;
  }

  if (candidate.outcome === best.outcome) {
    return distanceLossFromBest(candidate, best, mover) <= policyConfig.distanceSlack;
  }

  return true;
}

export function annotateLoopRisk(state, rankedCandidates, historyApi) {
  return rankedCandidates.map((candidate) => {
    const immediateUndo = historyApi.isImmediateUndo?.(state.turn, candidate.move, state) ?? false;
    const repeatsResponse =
      historyApi.wouldRepeatResponse?.(state.turn, state, candidate.nextState ?? null) ?? false;
    const repeatedPositionCount =
      candidate.nextState ? historyApi.getPositionRepeatCount?.(candidate.nextState) ?? 0 : 0;

    return {
      ...candidate,
      loopRisk: immediateUndo || repeatsResponse || repeatedPositionCount >= 2
    };
  }).sort((left, right) => {
    if (left.loopRisk !== right.loopRisk) {
      return Number(left.loopRisk) - Number(right.loopRisk);
    }
    return compareHardCandidates(left, right, state.turn);
  });
}

function createNoopHistoryApi() {
  return {
    getPositionRepeatCount() {
      return 0;
    },
    hasLoopRisk() {
      return false;
    },
    isImmediateUndo() {
      return false;
    },
    wouldRepeatResponse() {
      return false;
    }
  };
}

function choosePolicyIndex(candidates, state, difficulty) {
  if (candidates.length <= 1) return 0;

  const seedIndex = deterministicChoiceIndex(state, difficulty, candidates.length);
  if (difficulty === 'easy') {
    return 1 + (seedIndex % Math.max(1, candidates.length - 1));
  }
  if (difficulty === 'medium') {
    return seedIndex % Math.min(candidates.length, 2);
  }
  return seedIndex;
}
