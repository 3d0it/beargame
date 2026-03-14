import { MAX_BEAR_MOVES, createGame } from '../web/game.js';
import {
  BOARD_NODES,
} from '../web/game-state-helpers.js';
import {
  chooseGreedyMove,
  getBearLegalMoves,
  getHunterLegalMoves,
  strategicScore
} from './ai-eval-helpers.mjs';

const BASE_SCENARIOS = [
  { difficulty: 'easy', opponent: 'random', matches: 16 },
  { difficulty: 'medium', opponent: 'random', matches: 16 },
  { difficulty: 'hard', opponent: 'random', matches: 16 },
  { difficulty: 'easy', opponent: 'greedy', matches: 16 },
  { difficulty: 'medium', opponent: 'greedy', matches: 16 },
  { difficulty: 'hard', opponent: 'greedy', matches: 16 }
];
const TARGET_RATINGS = {
  easy: 3,
  medium: 5,
  hard: 8
};
const VALID_DIFFICULTIES = new Set(Object.keys(TARGET_RATINGS));
const VALID_OPPONENTS = new Set(['random', 'greedy']);

const hunterLunettes = createGame().hunterLunettes.map((lunette) => [...lunette]);

function parseArgs(argv) {
  const options = {
    difficulties: null,
    opponents: null,
    matchesOverride: null
  };

  for (const arg of argv) {
    if (arg.startsWith('--difficulties=')) {
      options.difficulties = arg
        .slice('--difficulties='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => VALID_DIFFICULTIES.has(value));
    } else if (arg.startsWith('--opponents=')) {
      options.opponents = arg
        .slice('--opponents='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => VALID_OPPONENTS.has(value));
    } else if (arg.startsWith('--matches=')) {
      const parsed = Number.parseInt(arg.slice('--matches='.length), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.matchesOverride = parsed;
      }
    }
  }

  return options;
}

function selectScenarios(argv) {
  const options = parseArgs(argv);
  return BASE_SCENARIOS
    .filter((scenario) => !options.difficulties || options.difficulties.includes(scenario.difficulty))
    .filter((scenario) => !options.opponents || options.opponents.includes(scenario.opponent))
    .map((scenario) => ({
      ...scenario,
      matches: options.matchesOverride ?? scenario.matches
    }));
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

function isOccupied(state, nodeId) {
  return state.bear === nodeId || state.hunters.includes(nodeId);
}

function chooseRandomLunette(rng) {
  return sample(hunterLunettes, rng);
}

function chooseGreedyLunette(rng) {
  let best = hunterLunettes[0];
  let bestScore = Infinity;
  for (const lunette of hunterLunettes) {
    let bearBestReply = -Infinity;
    for (const node of BOARD_NODES) {
      if (lunette.includes(node.id)) continue;
      bearBestReply = Math.max(
        bearBestReply,
        strategicScore({
          hunters: lunette,
          bear: node.id,
          bearMoves: 0,
          turn: 'bear'
        }, 'bear')
      );
    }
    if (bearBestReply < bestScore || (bearBestReply === bestScore && rng() < 0.5)) {
      bestScore = bearBestReply;
      best = lunette;
    }
  }
  return best;
}

function chooseRandomBearStart(state, rng) {
  const options = BOARD_NODES.map((node) => node.id)
    .filter((nodeId) => !isOccupied(state, nodeId))
    .filter(
      (nodeId) =>
        getBearLegalMoves({
          ...state,
          bear: nodeId
        }).length > 0
    );
  return sample(options, rng);
}

function chooseGreedyBearStart(state, rng) {
  const options = BOARD_NODES.map((node) => node.id)
    .filter((nodeId) => !isOccupied(state, nodeId))
    .filter(
      (nodeId) =>
        getBearLegalMoves({
          ...state,
          bear: nodeId
        }).length > 0
    );
  let best = options[0];
  let bestScore = -Infinity;
  for (const nodeId of options) {
    const score = strategicScore({
      ...state,
      bear: nodeId
    }, 'bear');
    if (score > bestScore || (score === bestScore && rng() < 0.5)) {
      bestScore = score;
      best = nodeId;
    }
  }
  return best;
}

function chooseRandomBearMove(state, rng) {
  const moves = getBearLegalMoves(state);
  return moves.length > 0 ? sample(moves, rng) : null;
}

function chooseGreedyBearMove(state, rng) {
  const moves = getBearLegalMoves(state);
  if (moves.length === 0) return null;
  const bestMove = chooseGreedyMove({ ...state, turn: 'bear' });
  if (!bestMove) return null;
  return bestMove.to;
}

function chooseRandomHunterMove(state, rng) {
  const moves = getHunterLegalMoves(state);
  return moves.length > 0 ? sample(moves, rng) : null;
}

function chooseGreedyHunterMove(state, rng) {
  const moves = getHunterLegalMoves(state);
  if (moves.length === 0) return null;
  const bestMove = chooseGreedyMove({ ...state, turn: 'hunters' });
  if (!bestMove) return null;
  return bestMove;
}

function policyFor(opponent, rng) {
  if (opponent === 'greedy') {
    return {
      chooseHuntersLunette: () => chooseGreedyLunette(rng),
      chooseBearStart: (state) => chooseGreedyBearStart(state, rng),
      chooseBearMove: (state) => chooseGreedyBearMove(state, rng),
      chooseHunterMove: (state) => chooseGreedyHunterMove(state, rng)
    };
  }

  return {
    chooseHuntersLunette: () => chooseRandomLunette(rng),
    chooseBearStart: (state) => chooseRandomBearStart(state, rng),
    chooseBearMove: (state) => chooseRandomBearMove(state, rng),
    chooseHunterMove: (state) => chooseRandomHunterMove(state, rng)
  };
}

function installImmediateTimers() {
  const queue = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => {
    queue.push(callback);
    return queue.length;
  };

  return {
    drain() {
      while (queue.length > 0) {
        const callback = queue.shift();
        callback();
      }
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout;
    }
  };
}

function isComputerTurn(state) {
  if (state.mode !== 'hvc') return false;
  const computerControlsBear = state.round % 2 === 1 ? state.computerSide === 'bear' : state.computerSide !== 'bear';
  if (state.phase === 'setup-hunters') return !computerControlsBear;
  if (state.phase === 'setup-bear') return computerControlsBear;
  if (state.phase !== 'playing') return false;
  return state.turn === 'bear' ? computerControlsBear : !computerControlsBear;
}

function playHumanAction(game, state, policy) {
  if (state.phase === 'setup-hunters') {
    const lunette = policy.chooseHuntersLunette(state);
    game.clickNode(lunette[0]);
    return;
  }

  if (state.phase === 'setup-bear') {
    game.clickNode(policy.chooseBearStart(state));
    return;
  }

  if (state.turn === 'bear') {
    const move = policy.chooseBearMove(state);
    if (move === null) throw new Error(`Human bear has no legal moves in phase=${state.phase}`);
    game.clickNode(move);
    return;
  }

  const move = policy.chooseHunterMove(state);
  if (!move) throw new Error(`Human hunters have no legal moves in phase=${state.phase}`);
  game.clickNode(state.hunters[move.hunterIndex]);
  game.clickNode(move.to);
}

function evaluateScenario({ difficulty, opponent, matches }, seedBase = 1) {
  const timers = installImmediateTimers();
  try {
    const summary = {
      difficulty,
      opponent,
      matches,
      aiMatchWins: 0,
      baselineMatchWins: 0,
      ties: 0,
      aiHunterRoundsWon: 0,
      aiBearDrawRounds: 0,
      aiHunterRounds: 0,
      aiBearRounds: 0,
      immobilizationMoves: []
    };

    for (let matchIndex = 0; matchIndex < matches; matchIndex += 1) {
      const rng = createRng(seedBase + matchIndex * 17 + difficulty.length * 31 + opponent.length * 131);
      const game = createGame();
      const policy = policyFor(opponent, rng);
      game.newMatch('hvc', 'bear', difficulty);

      let guard = 0;
      while (guard < 2000) {
        guard += 1;
        timers.drain();
        const state = game.getState();
        if (state.phase === 'match-over' || state.phase === 'tie-after-two-rounds') {
          break;
        }
        if (isComputerTurn(state)) {
          throw new Error(`Computer turn was not drained for ${difficulty}/${opponent}`);
        }
        playHumanAction(game, state, policy);
      }

      const state = game.getState();
      if (guard >= 2000) {
        throw new Error(`Guard exceeded for ${difficulty}/${opponent}`);
      }

      const aiScore = {
        'player-1': 0,
        'player-2': 0
      };

      for (const round of state.roundResults) {
        const aiPlayer = 'player-1';
        const aiAsHunters = round.huntersPlayer === aiPlayer;
        if (aiAsHunters) {
          summary.aiHunterRounds += 1;
          if (round.reason === 'hunters-win') {
            summary.aiHunterRoundsWon += 1;
            summary.immobilizationMoves.push(round.immobilizationMoves);
            aiScore[aiPlayer] += 1;
          }
        } else {
          summary.aiBearRounds += 1;
          if (round.reason === 'draw') {
            summary.aiBearDrawRounds += 1;
            aiScore[aiPlayer] += 1;
          } else {
            const baselinePlayer = aiPlayer === 'player-1' ? 'player-2' : 'player-1';
            aiScore[baselinePlayer] += 1;
          }
        }
      }

      if (state.matchSummary?.isTie) {
        summary.ties += 1;
      } else if (state.matchSummary?.winnerPlayer === 'player-1') {
        summary.aiMatchWins += 1;
      } else if (state.matchSummary?.winnerPlayer === 'player-2') {
        summary.baselineMatchWins += 1;
      }
    }

    return summary;
  } finally {
    timers.restore();
  }
}

function average(values) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreDifficulty(resultsForDifficulty) {
  let score = 1;
  for (const result of resultsForDifficulty) {
    const matchWinRate = result.aiMatchWins / result.matches;
    const hunterWinRate = result.aiHunterRoundsWon / Math.max(1, result.aiHunterRounds);
    const bearDrawRate = result.aiBearDrawRounds / Math.max(1, result.aiBearRounds);
    const baselineStrength = result.opponent === 'greedy' ? 3.4 : 1.8;
    score += baselineStrength * (matchWinRate * 0.55 + hunterWinRate * 0.3 + bearDrawRate * 0.15);
  }
  return Math.min(10, Number(score.toFixed(1)));
}

const scenarios = selectScenarios(process.argv.slice(2));
if (scenarios.length === 0) {
  throw new Error('No scenarios selected. Use valid --difficulties and --opponents filters.');
}

const allResults = scenarios.map((scenario) => evaluateScenario(scenario));
const grouped = new Map();

for (const result of allResults) {
  const list = grouped.get(result.difficulty) ?? [];
  list.push(result);
  grouped.set(result.difficulty, list);
}

for (const [difficulty, results] of grouped) {
  const rating = scoreDifficulty(results);
  console.log(`\n${difficulty.toUpperCase()}  rating=${rating}/10 | target=${TARGET_RATINGS[difficulty]}/10`);
  for (const result of results) {
    const avgImmobilization = average(result.immobilizationMoves);
    console.log(
      [
        `  vs ${result.opponent}`,
        `match AI ${result.aiMatchWins}/${result.matches}`,
        `baseline ${result.baselineMatchWins}/${result.matches}`,
        `ties ${result.ties}/${result.matches}`,
        `hunter rounds ${result.aiHunterRoundsWon}/${result.aiHunterRounds}`,
        `bear draws ${result.aiBearDrawRounds}/${result.aiBearRounds}`,
        `avg trap moves ${avgImmobilization === null ? 'n/a' : avgImmobilization.toFixed(1)}`
      ].join(' | ')
    );
  }
}
