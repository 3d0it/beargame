import { createAiEngine, DIFFICULTY_POLICY_CONFIG, POLICY_PARAMETER_GRID } from '../web/game-ai-policy.js';
import {
  AI_OUTCOMES,
  canonicalBoardSignature,
  moveCodeFor,
  POSITION_BY_INDEX
} from '../web/game-ai-model.js';
import { getExactStateInfo, isCriticalPlayingState } from '../web/game-ai-solver.js';
import {
  applyVirtualMoveToState,
  canonicalHuntersKey,
  getBearLegalMovesForState,
  HUNTER_LUNETTES,
  MAX_BEAR_MOVES,
  validBearStartPositionsForHunters
} from '../web/game-state-helpers.js';

export const TARGET_RATINGS = Object.freeze({
  easy: 6,
  medium: 7.5,
  hard: 9.5
});

export function createOpeningMatrix() {
  return HUNTER_LUNETTES.flatMap((lunette) =>
    validBearStartPositionsForHunters(lunette).map((bearStart) => ({
      id: `${lunette.join('-')}|${bearStart}`,
      startState: {
        phase: 'playing',
        turn: 'bear',
        bearMoves: 0,
        hunters: [...lunette],
        bear: bearStart
      }
    }))
  );
}

export function createProbeMatrix() {
  const engine = createAiEngine({ history: createHistoryTracker() });
  const probeStates = [];
  const perBucketCounts = new Map();

  for (const bearMoves of [6, 12, 18, 24]) {
    for (const turn of ['bear', 'hunters']) {
      const bucketKey = `${turn}|${bearMoves}`;
      perBucketCounts.set(bucketKey, 0);

      for (const position of POSITION_BY_INDEX) {
        if ((perBucketCounts.get(bucketKey) ?? 0) >= 3) break;

        const state = {
          phase: 'playing',
          turn,
          bearMoves,
          hunters: [...position.hunters],
          bear: position.bear
        };
        if (terminalReason(state)) continue;

        const ranked = engine.rankPlayingMoves(state);
        if (ranked.length < 3) continue;
        if (isCriticalPlayingState(state, ranked, false)) continue;

        const hardMove =
          turn === 'bear'
            ? engine.chooseBearMove(state, 'hard', DIFFICULTY_POLICY_CONFIG.hard)
            : engine.chooseHunterMove(state, 'hard', DIFFICULTY_POLICY_CONFIG.hard);
        const mediumMove =
          turn === 'bear'
            ? engine.chooseBearMove(state, 'medium', DIFFICULTY_POLICY_CONFIG.medium)
            : engine.chooseHunterMove(state, 'medium', DIFFICULTY_POLICY_CONFIG.medium);
        const easyMove =
          turn === 'bear'
            ? engine.chooseBearMove(state, 'easy', DIFFICULTY_POLICY_CONFIG.easy)
            : engine.chooseHunterMove(state, 'easy', DIFFICULTY_POLICY_CONFIG.easy);

        const hardCode = moveCodeFor(turn, hardMove);
        const mediumCode = moveCodeFor(turn, mediumMove);
        const easyCode = moveCodeFor(turn, easyMove);
        if (hardCode === mediumCode && hardCode === easyCode) continue;

        probeStates.push({
          id: `probe|${canonicalBoardSignature(state)}`,
          startState: state
        });
        perBucketCounts.set(bucketKey, (perBucketCounts.get(bucketKey) ?? 0) + 1);
      }
    }
  }

  return probeStates;
}

export function createHistoryTracker() {
  let recentPositionHashes = [];
  let recentMoves = [];
  let recentResponsePatterns = [];

  return {
    getPositionRepeatCount(state) {
      const nextHash = positionHash(state);
      return recentPositionHashes.filter((hash) => hash === nextHash).length;
    },
    hasLoopRisk(state) {
      return this.getPositionRepeatCount(state) > 1;
    },
    isImmediateUndo(side, move, state) {
      const from = side === 'bear' ? state.bear : move.from;
      if (!Number.isInteger(from) || !move || typeof move.to !== 'number') return false;

      for (let index = recentMoves.length - 1; index >= 0; index -= 1) {
        const previous = recentMoves[index];
        if (previous.side !== side) continue;
        return previous.from === move.to && previous.to === from;
      }

      return false;
    },
    wouldRepeatResponse(side, before, after) {
      if (!before || !after) return false;
      const beforeHash = positionHash(before);
      const afterHash = positionHash(after);

      return recentResponsePatterns.some(
        (pattern) => pattern.side === side && pattern.before === beforeHash && pattern.after === afterHash
      );
    },
    rememberMove(side, move, state) {
      const from = side === 'bear' ? state.bear : move.from;
      recentMoves.push({ side, from, to: move.to });
      if (recentMoves.length > 12) recentMoves = recentMoves.slice(-12);
    },
    rememberPosition(state) {
      recentPositionHashes.push(positionHash(state));
      if (recentPositionHashes.length > 12) recentPositionHashes = recentPositionHashes.slice(-12);
    },
    rememberResponsePattern(side, before, after) {
      recentResponsePatterns.push({
        side,
        before: positionHash(before),
        after: positionHash(after)
      });
      if (recentResponsePatterns.length > 12) {
        recentResponsePatterns = recentResponsePatterns.slice(-12);
      }
    }
  };
}

export function playBenchmarkRound({
  opening,
  bearDifficulty,
  huntersDifficulty,
  configs = DIFFICULTY_POLICY_CONFIG
}) {
  const history = createHistoryTracker();
  const ai = createAiEngine({ history });
  const controlledMoves = [];
  const controlledDifficulties = new Set([bearDifficulty, huntersDifficulty]);

  let state = {
    phase: 'playing',
    turn: opening.startState.turn,
    bearMoves: opening.startState.bearMoves,
    hunters: [...opening.startState.hunters],
    bear: opening.startState.bear
  };

  const startExact = getExactStateInfo(state);
  history.rememberPosition(state);

  while (true) {
    const reason = terminalReason(state);
    if (reason) {
      return {
        opening,
        bearDifficulty,
        huntersDifficulty,
        startExact,
        finalState: state,
        reason,
        controlledMoves
      };
    }

    const mover = state.turn;
    const difficulty = mover === 'bear' ? bearDifficulty : huntersDifficulty;
    const policyConfig = configs[difficulty] ?? DIFFICULTY_POLICY_CONFIG[difficulty];
    const ranked = ai.rankPlayingMoves(state);
    const move =
      mover === 'bear'
        ? ai.chooseBearMove(state, difficulty, policyConfig)
        : ai.chooseHunterMove(state, difficulty, policyConfig);

    if (!move) {
      throw new Error(`No move available for ${difficulty}/${mover} on ${canonicalBoardSignature(state)}`);
    }

    const moveCode = moveCodeFor(mover, move);
    const rankIndex = ranked.findIndex((candidate) => candidate.moveCode === moveCode);
    const chosen = rankIndex >= 0 ? ranked[rankIndex] : null;

    if (controlledDifficulties.has(difficulty)) {
      controlledMoves.push({
        mover,
        difficulty,
        ranked,
        rankIndex,
        best: ranked[0] ?? null,
        chosen,
        optionCount: ranked.length
      });
    }

    const nextState = applyVirtualMoveToState(state, mover, move);
    const terminal = terminalReason(nextState);

    if (!terminal) {
      history.rememberMove(mover, move, state);
      history.rememberPosition(nextState);
      history.rememberResponsePattern(mover, state, nextState);
    }

    state = {
      ...nextState,
      phase: 'playing'
    };
  }
}

export function evaluateDifficulty(difficulty, configs = DIFFICULTY_POLICY_CONFIG, openings = createOpeningMatrix()) {
  const rounds = [];
  const probes = createProbeMatrix();

  for (const opening of openings) {
    rounds.push(
      playBenchmarkRound({
        opening,
        bearDifficulty: difficulty,
        huntersDifficulty: 'hard',
        configs
      })
    );
    rounds.push(
      playBenchmarkRound({
        opening,
        bearDifficulty: 'hard',
        huntersDifficulty: difficulty,
        configs
      })
    );
  }

  for (const probe of probes) {
    rounds.push(
      playBenchmarkRound({
        opening: probe,
        bearDifficulty: difficulty,
        huntersDifficulty: 'hard',
        configs
      })
    );
    rounds.push(
      playBenchmarkRound({
        opening: probe,
        bearDifficulty: 'hard',
        huntersDifficulty: difficulty,
        configs
      })
    );
  }

  const moveScores = [];
  const probeFirstMoveScores = [];
  let probeTopHits = 0;
  let probeRoundCount = 0;
  let optimalResultHits = 0;
  let loopIncidents = 0;
  let trapMovesTotal = 0;
  let trapMovesCount = 0;

  for (const round of rounds) {
    const sideUnderTest = round.bearDifficulty === difficulty ? 'bear' : 'hunters';
    const expected = expectedResultForSide(round.startExact, sideUnderTest);
    if (round.reason === expected) {
      optimalResultHits += 1;
    }

    if (round.reason === 'hunters-win') {
      trapMovesTotal += round.finalState.bearMoves;
      trapMovesCount += 1;
    }

    const controlledRecords = round.controlledMoves.filter((entry) => entry.difficulty === difficulty);
    if (round.opening.id.startsWith('probe|')) {
      const firstProbeRecord = controlledRecords[0] ?? null;
      if (firstProbeRecord) {
        probeRoundCount += 1;
        probeFirstMoveScores.push(scoreMoveRecord(firstProbeRecord));
        if (firstProbeRecord.rankIndex === 0) probeTopHits += 1;
      }
    }

    for (const record of controlledRecords) {
      moveScores.push(scoreMoveRecord(record));
      if (record.chosen?.loopRisk && record.ranked.some((candidate) => !candidate.loopRisk)) {
        loopIncidents += 1;
      }
    }
  }

  const optimalResultRate = rounds.length === 0 ? 0 : optimalResultHits / rounds.length;
  const averageMoveQuality = average(moveScores);
  const probeFirstMoveQuality = average(probeFirstMoveScores);
  const probeTopChoiceRate = probeRoundCount === 0 ? 0 : probeTopHits / probeRoundCount;
  const compositeScore = Math.max(
    0,
    Math.min(
      1,
      0.3 * optimalResultRate +
        0.3 * probeFirstMoveQuality +
        0.4 * probeTopChoiceRate -
        loopIncidents * 0.01
    )
  );
  const rating = Number((1 + 8.5 * compositeScore).toFixed(2));

  return {
    difficulty,
    rounds,
    probes,
    roundCount: rounds.length,
    moveCount: moveScores.length,
    optimalResultRate: Number(optimalResultRate.toFixed(4)),
    averageMoveQuality: Number(averageMoveQuality.toFixed(4)),
    probeFirstMoveQuality: Number(probeFirstMoveQuality.toFixed(4)),
    probeTopChoiceRate: Number(probeTopChoiceRate.toFixed(4)),
    loopIncidents,
    averageTrapMoves: trapMovesCount === 0 ? null : Number((trapMovesTotal / trapMovesCount).toFixed(2)),
    rating
  };
}

export function runAiBenchmark(configs = DIFFICULTY_POLICY_CONFIG) {
  const openings = createOpeningMatrix();
  const probes = createProbeMatrix();
  const levels = Object.fromEntries(
    ['easy', 'medium', 'hard'].map((difficulty) => [
      difficulty,
      evaluateDifficulty(difficulty, configs, openings)
    ])
  );

  return {
    openings,
    probes,
    levels,
    orderingOkay:
      levels.hard.rating >= levels.medium.rating && levels.medium.rating >= levels.easy.rating
  };
}

export function printAiBenchmark(result) {
  console.log('AI benchmark');
  console.log(`openings=${result.openings.length} probes=${result.probes.length}`);
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const row = result.levels[difficulty];
    console.log(
      `${difficulty.toUpperCase()} rating=${row.rating}/10 | optimal=${row.optimalResultRate} | probe=${row.probeFirstMoveQuality} | top=${row.probeTopChoiceRate} | loops=${row.loopIncidents} | avg trap=${row.averageTrapMoves ?? 'n/a'}`
    );
  }
}

export function runAiReport() {
  const openings = createOpeningMatrix();
  const hardSummary = evaluateDifficulty('hard', DIFFICULTY_POLICY_CONFIG, openings);
  const currentBenchmark = {
    levels: {
      easy: evaluateDifficulty('easy', DIFFICULTY_POLICY_CONFIG, openings),
      medium: evaluateDifficulty('medium', DIFFICULTY_POLICY_CONFIG, openings),
      hard: hardSummary
    }
  };

  let bestCandidate = null;
  let tested = 0;

  for (const mediumConfig of expandGrid(POLICY_PARAMETER_GRID.medium)) {
    for (const easyConfig of expandGrid(POLICY_PARAMETER_GRID.easy)) {
      tested += 1;
      const configs = {
        ...DIFFICULTY_POLICY_CONFIG,
        easy: easyConfig,
        medium: mediumConfig,
        hard: DIFFICULTY_POLICY_CONFIG.hard
      };
      const easySummary = evaluateDifficulty('easy', configs, openings);
      const mediumSummary = evaluateDifficulty('medium', configs, openings);
      const candidate = {
        configs,
        levels: {
          easy: easySummary,
          medium: mediumSummary,
          hard: hardSummary
        }
      };
      candidate.score = reportCandidateScore(candidate.levels);
      if (!bestCandidate || candidate.score < bestCandidate.score) {
        bestCandidate = candidate;
      }
    }
  }

  return {
    tested,
    bestCandidate,
    currentCandidate: {
      configs: DIFFICULTY_POLICY_CONFIG,
      levels: currentBenchmark.levels,
      score: reportCandidateScore(currentBenchmark.levels)
    }
  };
}

export function printAiReport(result) {
  console.log('AI calibration report');
  console.log(`candidates tested=${result.tested}`);
  console.log(
    `current easy=${result.currentCandidate.levels.easy.rating} medium=${result.currentCandidate.levels.medium.rating} hard=${result.currentCandidate.levels.hard.rating} score=${result.currentCandidate.score.toFixed(2)}`
  );
  console.log(
    `best easy=${result.bestCandidate.levels.easy.rating} medium=${result.bestCandidate.levels.medium.rating} hard=${result.bestCandidate.levels.hard.rating} score=${result.bestCandidate.score.toFixed(2)}`
  );
  console.log(`best medium config=${JSON.stringify(result.bestCandidate.configs.medium)}`);
  console.log(`best easy config=${JSON.stringify(result.bestCandidate.configs.easy)}`);
}

export function configMatchesCurrent(bestCandidate) {
  return (
    JSON.stringify(bestCandidate.configs.easy) === JSON.stringify(DIFFICULTY_POLICY_CONFIG.easy) &&
    JSON.stringify(bestCandidate.configs.medium) === JSON.stringify(DIFFICULTY_POLICY_CONFIG.medium)
  );
}

export function expectedResultForSide(exactInfo, side) {
  if (side === 'bear') {
    return exactInfo.outcome === AI_OUTCOMES.draw ? 'draw' : 'hunters-win';
  }
  return exactInfo.outcome === AI_OUTCOMES.huntersWin ? 'hunters-win' : 'draw';
}

export function scoreMoveRecord(record) {
  if (!record.best || !record.chosen) return 0;

  const sameOutcome = record.best.outcome === record.chosen.outcome;
  const outcomeScore = sameOutcome ? 1 : 0;
  const distancePenalty = sameOutcome
    ? Math.min(1, distanceLoss(record) / 4)
    : 1;
  const distanceScore = sameOutcome ? 1 - distancePenalty : 0;
  const rankScore =
    record.optionCount <= 1 || record.rankIndex <= 0
      ? 1
      : Math.max(0, 1 - record.rankIndex / Math.max(1, record.optionCount - 1));

  return Number((0.6 * outcomeScore + 0.25 * distanceScore + 0.15 * rankScore).toFixed(4));
}

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function distanceLoss(record) {
  if (!record.best || !record.chosen) return Infinity;
  if (record.best.outcome !== record.chosen.outcome) return Infinity;

  if (record.mover === 'hunters' && record.best.outcome === AI_OUTCOMES.huntersWin) {
    return Math.max(0, record.chosen.distance - record.best.distance);
  }
  return Math.max(0, record.best.distance - record.chosen.distance);
}

function expandGrid(grid) {
  const entries = Object.entries(grid);
  const results = [];

  function visit(index, partial) {
    if (index >= entries.length) {
      results.push({ ...partial });
      return;
    }

    const [key, values] = entries[index];
    for (const value of values) {
      partial[key] = value;
      visit(index + 1, partial);
    }
  }

  visit(0, {});
  return results;
}

function reportCandidateScore(levels) {
  const easyDelta = Math.abs(levels.easy.rating - TARGET_RATINGS.easy);
  const mediumDelta = Math.abs(levels.medium.rating - TARGET_RATINGS.medium);
  const hardDelta = Math.abs(levels.hard.rating - TARGET_RATINGS.hard);
  const loopPenalty = levels.easy.loopIncidents + levels.medium.loopIncidents + levels.hard.loopIncidents;
  const orderingPenalty =
    levels.medium.rating < levels.easy.rating || levels.hard.rating < levels.medium.rating ? 50 : 0;

  return easyDelta + mediumDelta + hardDelta + loopPenalty * 10 + orderingPenalty;
}

function positionHash(state) {
  return `${state.turn}|${state.bear}|${canonicalHuntersKey(state.hunters)}`;
}

function terminalReason(state) {
  if (state.bear === null) return null;
  if (getBearLegalMovesForState(state).length === 0) return 'hunters-win';
  if (state.bearMoves >= MAX_BEAR_MOVES) return 'draw';
  return null;
}
