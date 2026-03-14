import { BOARD_NODES, MAX_BEAR_MOVES, createGame } from '../web/game.js';

const SAMPLE_COUNT = 16;
const BASE_OPENING_PLIES = 5;
const ROLLOUT_PLIES = 6;

const adjacency = buildAdjacency(createGame().edges);
const hunterLunettes = createGame().hunterLunettes.map((lunette) => [...lunette]);
const NODE_BY_ID = new Map(BOARD_NODES.map((node) => [node.id, node]));

function buildAdjacency(edges) {
  const map = new Map();
  for (const node of BOARD_NODES) map.set(node.id, []);
  for (const [a, b] of edges) {
    map.get(a).push(b);
    map.get(b).push(a);
  }
  return map;
}

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

function cloneState(state) {
  return {
    ...state,
    hunters: [...state.hunters]
  };
}

function isOccupied(state, nodeId) {
  return state.bear === nodeId || state.hunters.includes(nodeId);
}

function getBearLegalMoves(state) {
  if (state.bear === null) return [];
  return (adjacency.get(state.bear) ?? []).filter((nodeId) => !isOccupied(state, nodeId));
}

function getHunterLegalMoves(state) {
  const moves = [];
  for (let hunterIndex = 0; hunterIndex < state.hunters.length; hunterIndex += 1) {
    const from = state.hunters[hunterIndex];
    for (const to of adjacency.get(from) ?? []) {
      if (!isOccupied(state, to)) {
        moves.push({ hunterIndex, from, to });
      }
    }
  }
  return moves;
}

function applyBearMove(state, to) {
  const next = cloneState(state);
  next.bear = to;
  next.bearMoves += 1;
  next.turn = 'hunters';
  return next;
}

function applyHunterMove(state, move) {
  const next = cloneState(state);
  next.hunters[move.hunterIndex] = move.to;
  next.turn = 'bear';
  return next;
}

function applyMove(state, move) {
  return state.turn === 'bear' ? applyBearMove(state, move.to) : applyHunterMove(state, move);
}

function legalMoves(state) {
  return state.turn === 'bear' ? getBearLegalMoves(state).map((to) => ({ to })) : getHunterLegalMoves(state);
}

function moveLabel(state, move) {
  return state.turn === 'bear' ? `orso ${state.bear} -> ${move.to}` : `cacciatore[${move.hunterIndex}] ${move.from} -> ${move.to}`;
}

function isBearTrapped(state) {
  return state.bear !== null && getBearLegalMoves(state).length === 0;
}

function nodeDistance(a, b) {
  const nodeA = NODE_BY_ID.get(a);
  const nodeB = NODE_BY_ID.get(b);
  if (!nodeA || !nodeB) return 0;
  return Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
}

function reachableCount(state, start, maxDepth) {
  if (start === null || start === undefined) return 0;
  const queue = [{ node: start, depth: 0 }];
  const visited = new Set([start]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    for (const next of adjacency.get(current.node) ?? []) {
      if (visited.has(next) || state.hunters.includes(next)) continue;
      visited.add(next);
      queue.push({ node: next, depth: current.depth + 1 });
    }
  }

  return visited.size;
}

function hunterPressureProfile(state) {
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

function bearEscapeProfile(state) {
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

function strategicScore(state, perspective) {
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

function chooseGreedyMove(state) {
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

function rolloutScore(startState, perspective, plies = ROLLOUT_PLIES) {
  let current = cloneState(startState);
  for (let ply = 0; ply < plies; ply += 1) {
    if (isBearTrapped(current) || current.bearMoves >= MAX_BEAR_MOVES) break;
    const move = chooseGreedyMove(current);
    if (!move) break;
    current = applyMove(current, move);
  }
  return strategicScore(current, perspective);
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
      hunters: [...sample(hunterLunettes, rng)],
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
      score: rolloutScore(afterMove, position.turn)
    };
  });

  return options.sort((a, b) => b.score - a.score);
}

function normalizedMoveScore(optionScore, bestScore, worstScore) {
  if (bestScore === worstScore) return 10;
  return Number((((optionScore - worstScore) / (bestScore - worstScore)) * 10).toFixed(2));
}

function runDifficultyOnPosition(position, difficulty) {
  const game = createGame();
  game.setStateForBenchmark({
    ...position.state,
    difficulty,
    mode: 'hvc'
  });

  const before = game.getState();
  const options = evaluateMoveOptions(before);
  const bestScore = options[0]?.score ?? 0;
  const worstScore = options.at(-1)?.score ?? bestScore;

  const startedAt = performance.now();
  game.runComputerTurnSync();
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

console.log('Medium vs Hard Benchmark');
console.log(`positions: ${rows.length}`);
console.log(`medium=${summary.mediumScore}/10 | hard=${summary.hardScore}/10`);
console.log(`hard better on ${summary.hardBetter}/${rows.length} | medium better on ${summary.mediumBetter}/${rows.length} | equal ${summary.equal}/${rows.length}`);
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
