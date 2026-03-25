import { describe, expect, it } from 'vitest';
import { createGame } from './game.js';
import {
  AI_OUTCOMES,
  AI_TURNS,
  canonicalBoardSignature,
  createPlayingState,
  decodeStateIndex,
  POSITION_COUNT,
  stateIndexForState,
  STATE_COUNT,
  terminalInfoForState
} from './game-ai-model.js';
import {
  evaluateNonTerminalStateFromSuccessors,
  exactValueFromSuccessorInfo,
  listStateSuccessors
} from './game-ai-tablebase-core.js';
import { getExactStateInfo } from './game-ai-solver.js';
import {
  getBearLegalMovesForState,
  HUNTER_LUNETTES,
  MAX_BEAR_MOVES,
  validBearStartPositionsForHunters
} from './game-state-helpers.js';

const VALIDATION_SAMPLE_PER_BUCKET = 96;
const POSITION_SAMPLE_STEP = 251;
const VALIDATION_SAMPLE_INDEXES = buildUniformNonTerminalSample(VALIDATION_SAMPLE_PER_BUCKET);

describe('game-ai-tablebase validation', () => {
  it('preserves a decode -> encode round-trip across the full indexed space', { timeout: 15_000 }, () => {
    for (let index = 0; index < STATE_COUNT; index += 1) {
      const decoded = decodeStateIndex(index);
      if (!decoded) {
        throw new Error(`Unable to decode state index ${index}`);
      }

      const encoded = stateIndexForState({
        ...decoded,
        phase: 'playing'
      });
      if (encoded !== index) {
        throw new Error(`State index round-trip mismatch: ${index} -> ${encoded}`);
      }
    }
  });

  it('preserves encode/decode round-trips and no collisions on a wide uniform sample', () => {
    const signatures = new Map();

    for (const index of VALIDATION_SAMPLE_INDEXES) {
      const decoded = decodeStateIndex(index);
      const state = stateFromIndex(index);
      const roundTripIndex = stateIndexForState(state);
      const roundTripState = decodeStateIndex(roundTripIndex);
      const signature = canonicalBoardSignature(state);

      expect(roundTripIndex).toBe(index);
      expect(roundTripState).toEqual(decoded);

      if (signatures.has(signature)) {
        throw new Error(`Collision detected for ${signature} at indexes ${signatures.get(signature)} and ${index}`);
      }
      signatures.set(signature, index);
    }
  });

  it('matches tablebase values and pure successor evaluation on a large deterministic sample', () => {
    for (const index of VALIDATION_SAMPLE_INDEXES) {
      const state = stateFromIndex(index);
      const successors = listStateSuccessors(state);
      const successorInfos = successors.map(({ nextState }) => lookupStateInfo(nextState));
      const expected = evaluateNonTerminalStateFromSuccessors(state, successorInfos);
      const actual = getExactStateInfo(state);

      expect(successors.length).toBeGreaterThan(0);
      expect(actual).toEqual({
        outcome: expected.outcome,
        distance: expected.distance
      });
    }
  });

  it('keeps at least one optimal successor consistent with the current distance', () => {
    for (const index of VALIDATION_SAMPLE_INDEXES) {
      const state = stateFromIndex(index);
      const successors = listStateSuccessors(state);
      const successorInfos = successors.map(({ nextState }) => lookupStateInfo(nextState));
      const expected = evaluateNonTerminalStateFromSuccessors(state, successorInfos);

      expect(expected.optimalSuccessorIndexes.length).toBeGreaterThan(0);

      for (const optimalIndex of expected.optimalSuccessorIndexes) {
        expect(exactValueFromSuccessorInfo(successorInfos[optimalIndex])).toEqual({
          outcome: expected.outcome,
          distance: expected.distance
        });
      }
    }
  });

  it('makes terminal semantics explicit, including capture > move-limit precedence', () => {
    const trappedBeforeLimit = {
      phase: 'playing',
      turn: AI_TURNS.bear,
      bearMoves: 4,
      bear: 0,
      hunters: [1, 2, 3]
    };
    const trappedAtLimit = {
      phase: 'playing',
      turn: AI_TURNS.hunters,
      bearMoves: MAX_BEAR_MOVES,
      bear: 0,
      hunters: [1, 2, 3]
    };
    const drawAtLimit = {
      phase: 'playing',
      turn: AI_TURNS.hunters,
      bearMoves: MAX_BEAR_MOVES,
      bear: 5,
      hunters: [1, 2, 3]
    };

    expect(terminalInfoForState(trappedBeforeLimit)).toEqual({
      outcome: AI_OUTCOMES.huntersWin,
      distance: 0
    });
    expect(terminalInfoForState(trappedAtLimit)).toEqual({
      outcome: AI_OUTCOMES.huntersWin,
      distance: 0
    });
    expect(getBearLegalMovesForState(drawAtLimit).length).toBeGreaterThan(0);
    expect(terminalInfoForState(drawAtLimit)).toEqual({
      outcome: AI_OUTCOMES.draw,
      distance: 0
    });
    expect(getExactStateInfo(drawAtLimit)).toEqual({
      outcome: AI_OUTCOMES.draw,
      distance: 0
    });
  });

  it('shows that the no-move hunter branch is only defensive in the encoded legal space', { timeout: 15_000 }, () => {
    let suspiciousStates = 0;

    for (let index = 0; index < STATE_COUNT; index += 1) {
      const state = stateFromIndex(index);
      if (state.turn !== AI_TURNS.hunters) continue;
      if (terminalInfoForState(state)) continue;
      if (listStateSuccessors(state).length === 0) {
        suspiciousStates += 1;
      }
    }

    expect(suspiciousStates).toBe(0);
  });

  it('distinguishes encodable states from states truly reachable in a real match', { timeout: 15_000 }, () => {
    const summary = computeReachabilitySummary();

    expect(summary.openingStates).toBeGreaterThan(0);
    expect(summary.reachableEncodedStates).toBeGreaterThan(summary.openingStates);
    expect(summary.reachableEncodedStates).toBeLessThan(STATE_COUNT);
    expect(summary.unreachableEncodedStates).toBeGreaterThan(0);
    expect(summary.hunterNoMoveReachableStates).toBe(0);
    expect(summary.unencodedTerminalStates).toBeGreaterThan(0);
  });

  it('aligns runtime behavior with terminal semantics on truly reachable frontiers', () => {
    const game = createGame({ enableBenchmarkTools: true });

    game.benchmark.setState({
      mode: 'hvh',
      round: 1,
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 39,
      bear: 0,
      hunters: [2, 3, 4]
    });
    game.clickNode(4);
    game.clickNode(1);

    expect(game.getState().lastRoundResult?.reason).toBe('hunters-win');

    game.benchmark.setState({
      mode: 'hvh',
      round: 1,
      phase: 'playing',
      turn: 'bear',
      bearMoves: 39,
      bear: 17,
      hunters: [1, 2, 3]
    });
    game.clickNode(18);

    expect(game.getState().lastRoundResult?.reason).toBe('draw');
  });
});

function buildUniformNonTerminalSample(perBucket) {
  const sampleIndexes = [];

  for (let bearMoves = 0; bearMoves < MAX_BEAR_MOVES; bearMoves += 1) {
    for (const turn of [AI_TURNS.bear, AI_TURNS.hunters]) {
      let positionIndex = ((bearMoves * 97) + (turn === AI_TURNS.hunters ? 53 : 0)) % POSITION_COUNT;
      let added = 0;
      let attempts = 0;

      while (added < perBucket && attempts < POSITION_COUNT) {
        const state = createPlayingState(positionIndex, bearMoves, turn);
        if (state && !terminalInfoForState(state)) {
          sampleIndexes.push(stateIndexForState(state));
          added += 1;
        }

        positionIndex = (positionIndex + POSITION_SAMPLE_STEP) % POSITION_COUNT;
        attempts += 1;
      }
    }
  }

  return sampleIndexes;
}

function stateFromIndex(index) {
  const decoded = decodeStateIndex(index);
  if (!decoded) {
    throw new Error(`Unable to decode state index ${index}`);
  }

  return {
    ...decoded,
    phase: 'playing'
  };
}

function lookupStateInfo(state) {
  return getExactStateInfo(state);
}

function computeReachabilitySummary() {
  const visited = new Uint8Array(STATE_COUNT);
  const queue = [];
  const unencodedTerminalStates = new Set();

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
      if (index >= 0 && !visited[index]) {
        visited[index] = 1;
        queue.push(index);
      }
    }
  }
  const openingStates = queue.length;

  let cursor = 0;
  let hunterNoMoveReachableStates = 0;

  while (cursor < queue.length) {
    const state = stateFromIndex(queue[cursor]);
    cursor += 1;

    if (terminalInfoForState(state)) continue;

    const successors = listStateSuccessors(state);
    if (state.turn === AI_TURNS.hunters && successors.length === 0) {
      hunterNoMoveReachableStates += 1;
    }

    for (const { nextState } of successors) {
      const nextIndex = stateIndexForState(nextState);
      if (nextIndex >= 0) {
        if (!visited[nextIndex]) {
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
        continue;
      }

      if (terminalInfoForState(nextState)) {
        unencodedTerminalStates.add(canonicalBoardSignature(nextState));
      } else {
        throw new Error(`Found non-terminal state outside tablebase index space: ${canonicalBoardSignature(nextState)}`);
      }
    }
  }

  return {
    openingStates,
    reachableEncodedStates: queue.length,
    unreachableEncodedStates: STATE_COUNT - queue.length,
    hunterNoMoveReachableStates,
    unencodedTerminalStates: unencodedTerminalStates.size
  };
}
