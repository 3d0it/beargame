import { MAX_BEAR_MOVES, createGame } from '../web/game.js';
import {
  BOARD_NODES,
  HUNTER_LUNETTES
} from '../web/game-state-helpers.js';
import {
  applyMove,
  chooseGreedyMove,
  isBearTrapped,
  legalMoves,
  moveLabel,
  rolloutScore
} from './ai-eval-helpers.mjs';
import { pathToFileURL } from 'node:url';

const SAMPLE_COUNT = 16;
const BASE_OPENING_PLIES = 5;
const ROLLOUT_PLIES = 6;

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sample(items, rng) {
  return items[Math.floor(rng() * items.length)];
}

function isOccupied(state, nodeId) {
  return state.bear === nodeId || state.hunters.includes(nodeId);
}

function generateSamplePositions() {
  const positions = [];

  for (let seed = 1; seed <= SAMPLE_COUNT; seed += 1) {
    const rng = createRng(seed * 97);
    let state = {
      mode: 'hvc',
      computerSide: 'bear',
      round: 1,
      phase: 'playing',
      turn: 'bear',
      bear: null,
      hunters: [...sample(HUNTER_LUNETTES, rng)],
      bearMoves: 0
    };

    const bearStart = sample(
      BOARD_NODES.map((node) => node.id).filter((nodeId) => !isOccupied(state, nodeId)),
      rng
    );
    state.bear = bearStart;

    const openingPlies = BASE_OPENING_PLIES + (seed % 2);
    for (let ply = 0; ply < openingPlies; ply += 1) {
      if (isBearTrapped(state) || state.bearMoves >= MAX_BEAR_MOVES) break;
      const moves = legalMoves(state);
      if (moves.length === 0) break;
      const move = seed % 2 === 0 ? chooseGreedyMove(state) : sample(moves, rng);
      state = applyMove(state, move);
    }

    if (state.phase !== 'playing') continue;
    if (state.bear === null) continue;
    if (legalMoves(state).length === 0) continue;
    state.computerSide = state.turn;

    positions.push({
      id: `sample-${seed}`,
      state
    });
  }

  return positions;
}

function evaluateMoveOptions(position) {
  const options = legalMoves(position).map((move) => {
    const afterMove = applyMove(position, move);
    return {
      label: moveLabel(position, move),
      score: rolloutScore(afterMove, position.turn, ROLLOUT_PLIES)
    };
  });

  return options.sort((a, b) => b.score - a.score);
}

function normalizedMoveScore(optionScore, bestScore, worstScore) {
  if (bestScore === worstScore) return 10;
  return Number((((optionScore - worstScore) / (bestScore - worstScore)) * 10).toFixed(2));
}

function runDifficultyOnPosition(position, difficulty) {
  const game = createGame({ enableBenchmarkTools: true });
  game.benchmark.setState({
    ...position.state,
    difficulty,
    mode: 'hvc'
  });

  const before = game.getState();
  const options = evaluateMoveOptions(before);
  const bestScore = options[0]?.score ?? 0;
  const worstScore = options.at(-1)?.score ?? bestScore;

  const startedAt = performance.now();
  game.benchmark.runComputerTurnSync();
  const elapsedMs = performance.now() - startedAt;

  const after = game.getState();
  const chosen = changedPieces(before, after);
  const chosenOption = options.find((option) => option.label === chosen) ?? null;

  return {
    chosen,
    quality: chosenOption ? normalizedMoveScore(chosenOption.score, bestScore, worstScore) : 0,
    rank: chosenOption ? options.findIndex((option) => option.label === chosen) + 1 : null,
    optionCount: options.length,
    elapsedMs
  };
}

function changedPieces(before, after) {
  if (before.bear !== after.bear) return `orso ${before.bear} -> ${after.bear}`;
  for (let i = 0; i < before.hunters.length; i += 1) {
    if (before.hunters[i] !== after.hunters[i]) {
      return `cacciatore[${i}] ${before.hunters[i]} -> ${after.hunters[i]}`;
    }
  }
  return 'nessuna mossa';
}

export function runMediumHardBenchmark() {
  const positions = generateSamplePositions();
  const rows = positions.map((position) => ({
    position,
    medium: runDifficultyOnPosition(position, 'medium'),
    hard: runDifficultyOnPosition(position, 'hard')
  }));

  const summary = rows.reduce(
    (acc, row) => {
      acc.mediumScore += row.medium.quality;
      acc.hardScore += row.hard.quality;
      acc.mediumTime += row.medium.elapsedMs;
      acc.hardTime += row.hard.elapsedMs;
      if (row.hard.quality > row.medium.quality) acc.hardBetter += 1;
      else if (row.medium.quality > row.hard.quality) acc.mediumBetter += 1;
      else acc.equal += 1;
      return acc;
    },
    { mediumScore: 0, hardScore: 0, mediumTime: 0, hardTime: 0, hardBetter: 0, mediumBetter: 0, equal: 0 }
  );

  summary.mediumScore = Number((summary.mediumScore / rows.length).toFixed(2));
  summary.hardScore = Number((summary.hardScore / rows.length).toFixed(2));
  summary.mediumTime = Number((summary.mediumTime / rows.length).toFixed(1));
  summary.hardTime = Number((summary.hardTime / rows.length).toFixed(1));

  return { rows, summary };
}

export function printMediumHardBenchmark(result) {
  const { rows, summary } = result;
  console.log('Medium vs Hard Benchmark');
  console.log(`positions: ${rows.length}`);
  console.log(`medium=${summary.mediumScore}/10 | hard=${summary.hardScore}/10`);
  console.log(
    `hard better on ${summary.hardBetter}/${rows.length} | medium better on ${summary.mediumBetter}/${rows.length} | equal ${summary.equal}/${rows.length}`
  );
  console.log(`avg decision time: medium ${summary.mediumTime}ms | hard ${summary.hardTime}ms`);

  for (const row of rows) {
    console.log(`\n${row.position.id} (${row.position.state.turn})`);
    console.log(
      `  medium: ${row.medium.chosen} | quality=${row.medium.quality}/10 | rank=${row.medium.rank}/${row.medium.optionCount} | time=${row.medium.elapsedMs.toFixed(1)}ms`
    );
    console.log(
      `  hard: ${row.hard.chosen} | quality=${row.hard.quality}/10 | rank=${row.hard.rank}/${row.hard.optionCount} | time=${row.hard.elapsedMs.toFixed(1)}ms`
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  printMediumHardBenchmark(runMediumHardBenchmark());
}
