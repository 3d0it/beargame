import { pathToFileURL } from 'node:url';
import {
  AI_TURNS,
  canonicalBoardSignature,
  createPlayingState,
  outcomeLabel,
  POSITION_BY_INDEX,
  stateIndexFor,
  stateIndexForState,
  STATE_COUNT,
  terminalInfoForState
} from '../web/game-ai-model.js';
import {
  evaluateNonTerminalStateFromSuccessors,
  listStateSuccessors
} from '../web/game-ai-tablebase-core.js';
import { getExactStateInfo } from '../web/game-ai-solver.js';
import {
  HUNTER_LUNETTES,
  MAX_BEAR_MOVES,
  validBearStartPositionsForHunters
} from '../web/game-state-helpers.js';

const DEFAULT_MAX_MISMATCHES = 10;

export function runReachableTablebaseValidation(options = {}) {
  const startedAt = Date.now();
  const log = options.log ?? (() => {});
  const maxMismatches = Number.isInteger(options.maxMismatches)
    ? Math.max(1, options.maxMismatches)
    : DEFAULT_MAX_MISMATCHES;

  log('Collecting reachable states from legal openings...');
  const reachability = collectReachableStateSpace();

  log(
    `Reconstructing exact values on ${formatNumber(reachability.reachableEncodedStates)} reachable encoded states...`
  );
  const reconstructed = reconstructReachableTablebase(reachability.reachableFlags);

  log('Comparing reconstructed values against the checked-in runtime table...');
  const mismatches = compareReachableValues(
    reachability.reachableFlags,
    reconstructed.outcome,
    reconstructed.distance,
    maxMismatches
  );

  return {
    passed: mismatches.length === 0,
    summary: {
      openingStates: reachability.openingStates,
      reachableEncodedStates: reachability.reachableEncodedStates,
      unreachableEncodedStates: STATE_COUNT - reachability.reachableEncodedStates,
      reachableHunterNoMoveStates: reachability.reachableHunterNoMoveStates,
      terminalSuccessorsOutsideEncodedSpace: reachability.terminalSuccessorsOutsideEncodedSpace,
      reconstructedReachableStates: reconstructed.reconstructedStates,
      elapsedMs: Date.now() - startedAt
    },
    mismatches
  };
}

export function printReachableTablebaseValidation(result, log = console.log) {
  log('Reachable tablebase validation');
  log(`- opening states: ${formatNumber(result.summary.openingStates)}`);
  log(
    `- reachable encoded states: ${formatNumber(result.summary.reachableEncodedStates)} / ${formatNumber(STATE_COUNT)}`
  );
  log(`- unreachable encoded states: ${formatNumber(result.summary.unreachableEncodedStates)}`);
  log(`- reachable hunter no-move states: ${formatNumber(result.summary.reachableHunterNoMoveStates)}`);
  log(
    `- terminal successors outside encoded space: ${formatNumber(result.summary.terminalSuccessorsOutsideEncodedSpace)}`
  );
  log(`- reconstructed reachable states: ${formatNumber(result.summary.reconstructedReachableStates)}`);
  log(`- mismatches: ${formatNumber(result.mismatches.length)}`);
  log(`- elapsed: ${formatDuration(result.summary.elapsedMs)}`);

  if (result.mismatches.length === 0) return;

  log('Mismatch samples:');
  for (const mismatch of result.mismatches) {
    log(
      `  ${mismatch.signature} expected=${mismatch.expected.outcome}/${mismatch.expected.distance} actual=${mismatch.actual.outcome}/${mismatch.actual.distance}`
    );
  }
}

function collectReachableStateSpace() {
  const reachableFlags = new Uint8Array(STATE_COUNT);
  const queue = [];
  const terminalSuccessorsOutsideEncodedSpace = new Set();

  for (const lunette of HUNTER_LUNETTES) {
    for (const bear of validBearStartPositionsForHunters(lunette)) {
      const opening = {
        phase: 'playing',
        turn: AI_TURNS.bear,
        bearMoves: 0,
        hunters: [...lunette],
        bear
      };
      const index = stateIndexForState(opening);
      if (index >= 0 && !reachableFlags[index]) {
        reachableFlags[index] = 1;
        queue.push(index);
      }
    }
  }

  const openingStates = queue.length;
  let cursor = 0;
  let reachableHunterNoMoveStates = 0;

  while (cursor < queue.length) {
    const state = createPlayingStateFromIndex(queue[cursor]);
    cursor += 1;

    if (terminalInfoForState(state)) continue;

    const successors = listStateSuccessors(state);
    if (state.turn === AI_TURNS.hunters && successors.length === 0) {
      reachableHunterNoMoveStates += 1;
    }

    for (const { nextState } of successors) {
      const nextIndex = stateIndexForState(nextState);
      if (nextIndex >= 0) {
        if (!reachableFlags[nextIndex]) {
          reachableFlags[nextIndex] = 1;
          queue.push(nextIndex);
        }
        continue;
      }

      if (terminalInfoForState(nextState)) {
        terminalSuccessorsOutsideEncodedSpace.add(canonicalBoardSignature(nextState));
        continue;
      }

      throw new Error(`Found non-terminal state outside encoded space: ${canonicalBoardSignature(nextState)}`);
    }
  }

  return {
    openingStates,
    reachableEncodedStates: queue.length,
    reachableHunterNoMoveStates,
    terminalSuccessorsOutsideEncodedSpace: terminalSuccessorsOutsideEncodedSpace.size,
    reachableFlags
  };
}

function reconstructReachableTablebase(reachableFlags) {
  const outcome = new Uint8Array(STATE_COUNT);
  const distance = new Uint8Array(STATE_COUNT);
  let reconstructedStates = 0;

  for (let bearMoves = MAX_BEAR_MOVES - 1; bearMoves >= 0; bearMoves -= 1) {
    for (const turn of [AI_TURNS.bear, AI_TURNS.hunters]) {
      for (let positionIndex = 0; positionIndex < POSITION_BY_INDEX.length; positionIndex += 1) {
        const stateIndex = stateIndexFor(positionIndex, bearMoves, turn);
        if (!reachableFlags[stateIndex]) continue;

        const state = createPlayingState(positionIndex, bearMoves, turn);
        if (!state) continue;

        const terminal = terminalInfoForState(state);
        if (terminal) {
          outcome[stateIndex] = terminal.outcome;
          distance[stateIndex] = terminal.distance;
          reconstructedStates += 1;
          continue;
        }

        const successorInfos = listStateSuccessors(state).map(({ nextState }) => {
          const nextTerminal = terminalInfoForState(nextState);
          if (nextTerminal) return nextTerminal;

          const nextIndex = stateIndexForState(nextState);
          if (nextIndex < 0) {
            throw new Error(`Expected encoded successor for ${canonicalBoardSignature(nextState)}`);
          }
          if (!reachableFlags[nextIndex]) {
            throw new Error(`Expected reachable successor for ${canonicalBoardSignature(nextState)}`);
          }

          return {
            outcome: outcome[nextIndex],
            distance: distance[nextIndex]
          };
        });

        const exact = evaluateNonTerminalStateFromSuccessors(state, successorInfos);
        outcome[stateIndex] = exact.outcome;
        distance[stateIndex] = exact.distance;
        reconstructedStates += 1;
      }
    }
  }

  return {
    outcome,
    distance,
    reconstructedStates
  };
}

function compareReachableValues(reachableFlags, expectedOutcome, expectedDistance, maxMismatches) {
  const mismatches = [];

  outer:
  for (let bearMoves = 0; bearMoves < MAX_BEAR_MOVES; bearMoves += 1) {
    for (const turn of [AI_TURNS.bear, AI_TURNS.hunters]) {
      for (let positionIndex = 0; positionIndex < POSITION_BY_INDEX.length; positionIndex += 1) {
        const stateIndex = stateIndexFor(positionIndex, bearMoves, turn);
        if (!reachableFlags[stateIndex]) continue;

        const state = createPlayingState(positionIndex, bearMoves, turn);
        if (!state) continue;

        const actual = getExactStateInfo(state);
        const expected = {
          outcome: expectedOutcome[stateIndex],
          distance: expectedDistance[stateIndex]
        };

        if (actual.outcome === expected.outcome && actual.distance === expected.distance) {
          continue;
        }

        mismatches.push({
          signature: canonicalBoardSignature(state),
          expected: {
            outcome: outcomeLabel(expected.outcome),
            distance: expected.distance
          },
          actual: {
            outcome: outcomeLabel(actual.outcome),
            distance: actual.distance
          }
        });

        if (mismatches.length >= maxMismatches) {
          break outer;
        }
      }
    }
  }

  return mismatches;
}

function createPlayingStateFromIndex(index) {
  const positionIndex = Math.floor(index / (MAX_BEAR_MOVES * 2));
  const slot = index % (MAX_BEAR_MOVES * 2);
  const bearMoves = Math.floor(slot / 2);
  const turn = slot % 2 === 0 ? AI_TURNS.bear : AI_TURNS.hunters;
  const state = createPlayingState(positionIndex, bearMoves, turn);
  if (!state) {
    throw new Error(`Unable to create playing state for reachable index ${index}`);
  }
  return state;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runReachableTablebaseValidation({ log: console.log });
  printReachableTablebaseValidation(result);

  if (!result.passed) {
    throw new Error(`Reachable tablebase validation failed with ${result.mismatches.length} mismatches.`);
  }
}
