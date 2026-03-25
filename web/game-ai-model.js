import {
  adjacency,
  applyVirtualMoveToState,
  BOARD_NODE_IDS,
  canonicalHuntersKey,
  CENTER_NODE,
  CENTRAL_ZONE_NODES,
  getBearLegalMovesForState,
  getHunterLegalMovesForState,
  graphDistance,
  HUNTER_LUNETTES,
  INNER_RING_NODES,
  isGatewayNode,
  isInnerRingNode,
  isOuterRingNode,
  MAX_BEAR_MOVES,
  OUTER_GATEWAYS,
  OUTER_RING_NODES,
  reachableCountForState,
  sortHunters,
  validBearStartPositionsForHunters
} from './game-state-helpers.js';

export const AI_TURNS = {
  bear: 'bear',
  hunters: 'hunters'
};

export const TURN_INDEX = {
  bear: 0,
  hunters: 1
};

export const TURN_BY_INDEX = ['bear', 'hunters'];

export const AI_OUTCOMES = {
  draw: 0,
  huntersWin: 1
};

export const AI_OUTCOME_LABELS = {
  [AI_OUTCOMES.draw]: 'draw',
  [AI_OUTCOMES.huntersWin]: 'hunters-win'
};

export const STATE_TURN_STRIDE = 2;
export const STATE_SLOT_COUNT_PER_POSITION = MAX_BEAR_MOVES * STATE_TURN_STRIDE;

export const HUNTER_COMBINATIONS = buildHunterCombinations();
export const POSITION_BY_INDEX = [];

const HUNTER_COMBINATION_INDEX_BY_KEY = new Map(
  HUNTER_COMBINATIONS.map((hunters, index) => [canonicalHuntersKey(hunters), index])
);
const POSITION_INDEX_BY_SLOT = new Int32Array(HUNTER_COMBINATIONS.length * BOARD_NODE_IDS.length).fill(-1);
const BOARD_SECTOR_BY_NODE = buildBoardSectorMap();

for (let comboIndex = 0; comboIndex < HUNTER_COMBINATIONS.length; comboIndex += 1) {
  const hunters = HUNTER_COMBINATIONS[comboIndex];
  const occupied = new Set(hunters);
  for (const bear of BOARD_NODE_IDS) {
    if (occupied.has(bear)) continue;
    const positionIndex = POSITION_BY_INDEX.length;
    POSITION_BY_INDEX.push({
      hunters,
      bear
    });
    POSITION_INDEX_BY_SLOT[positionSlot(comboIndex, bear)] = positionIndex;
  }
}

export const POSITION_COUNT = POSITION_BY_INDEX.length;
export const STATE_COUNT = POSITION_COUNT * STATE_SLOT_COUNT_PER_POSITION;

export function buildHunterCombinations() {
  const combinations = [];

  for (let a = 0; a < BOARD_NODE_IDS.length; a += 1) {
    for (let b = a + 1; b < BOARD_NODE_IDS.length; b += 1) {
      for (let c = b + 1; c < BOARD_NODE_IDS.length; c += 1) {
        combinations.push([BOARD_NODE_IDS[a], BOARD_NODE_IDS[b], BOARD_NODE_IDS[c]]);
      }
    }
  }

  return combinations;
}

export function positionIndexFor(hunters, bear) {
  if (!Number.isInteger(bear)) return -1;
  const comboIndex = HUNTER_COMBINATION_INDEX_BY_KEY.get(canonicalHuntersKey(hunters));
  if (comboIndex === undefined) return -1;
  return POSITION_INDEX_BY_SLOT[positionSlot(comboIndex, bear)] ?? -1;
}

export function positionForIndex(positionIndex) {
  return POSITION_BY_INDEX[positionIndex] ?? null;
}

export function stateIndexFor(positionIndex, bearMoves, turn) {
  if (!Number.isInteger(positionIndex) || positionIndex < 0 || positionIndex >= POSITION_COUNT) return -1;
  if (!Number.isInteger(bearMoves) || bearMoves < 0 || bearMoves >= MAX_BEAR_MOVES) return -1;
  const turnIndex = TURN_INDEX[turn];
  if (turnIndex === undefined) return -1;
  return positionIndex * STATE_SLOT_COUNT_PER_POSITION + bearMoves * STATE_TURN_STRIDE + turnIndex;
}

export function stateIndexForState(state) {
  if (!state || state.phase && state.phase !== 'playing') return -1;
  return stateIndexFor(positionIndexFor(state.hunters, state.bear), state.bearMoves, state.turn);
}

export function decodeStateIndex(index) {
  if (!Number.isInteger(index) || index < 0 || index >= STATE_COUNT) return null;
  const positionIndex = Math.floor(index / STATE_SLOT_COUNT_PER_POSITION);
  const slot = index % STATE_SLOT_COUNT_PER_POSITION;
  const bearMoves = Math.floor(slot / STATE_TURN_STRIDE);
  const turn = TURN_BY_INDEX[slot % STATE_TURN_STRIDE];
  const position = positionForIndex(positionIndex);
  if (!position) return null;
  return {
    positionIndex,
    hunters: [...position.hunters],
    bear: position.bear,
    bearMoves,
    turn
  };
}

export function canonicalBoardSignature(state) {
  return `${state.turn}|${state.bearMoves}|${state.bear}|${canonicalHuntersKey(state.hunters)}`;
}

export function moveCodeFor(side, move) {
  if (side === AI_TURNS.bear) return `b:${move.to}`;
  return `h:${move.from}-${move.to}`;
}

export function outcomeLabel(outcome) {
  return AI_OUTCOME_LABELS[outcome] ?? 'unknown';
}

export function terminalInfoForState(state) {
  if (!state || !Number.isInteger(state.bear)) return null;
  const bearMobility = getBearLegalMovesForState(state).length;
  // Capture takes precedence over the move cap so the solver and runtime agree on frontier states.
  if (bearMobility === 0) {
    return {
      outcome: AI_OUTCOMES.huntersWin,
      distance: 0
    };
  }
  if (state.bearMoves >= MAX_BEAR_MOVES) {
    return {
      outcome: AI_OUTCOMES.draw,
      distance: 0
    };
  }
  return null;
}

export function createPlayingState(positionIndex, bearMoves, turn) {
  const position = positionForIndex(positionIndex);
  if (!position) return null;
  return {
    hunters: [...position.hunters],
    bear: position.bear,
    bearMoves,
    turn,
    phase: 'playing'
  };
}

export function describePlayingMoveCandidates(state, lookupStateInfo) {
  const mover = state.turn;
  const legalMoves =
    mover === AI_TURNS.bear
      ? getBearLegalMovesForState(state).map((to) => ({ to }))
      : getHunterLegalMovesForState(state);

  const candidates = legalMoves.map((move) => {
    const nextState = applyVirtualMoveToState(state, mover, move);
    const terminal = terminalInfoForState(nextState);
    const exact = terminal ?? lookupStateInfo(nextState);
    const distance = (exact?.distance ?? 0) + 1;
    return {
      move,
      moveCode: moveCodeFor(mover, move),
      outcome: exact?.outcome ?? AI_OUTCOMES.draw,
      distance,
      styleScore: scoreStyleForState(nextState, mover),
      nextState
    };
  });

  return candidates.sort((left, right) => compareHardCandidates(left, right, mover));
}

export function describeBearStartCandidates(hunters, lookupStateInfo) {
  const sortedHunters = sortHunters(hunters);
  const starts = validBearStartPositionsForHunters(sortedHunters);
  const candidates = starts.map((bear) => {
    const state = {
      hunters: [...sortedHunters],
      bear,
      bearMoves: 0,
      turn: AI_TURNS.bear,
      phase: 'playing'
    };
    const exact = lookupStateInfo(state);
    return {
      move: { to: bear },
      moveCode: `start:${bear}`,
      outcome: exact.outcome,
      distance: exact.distance,
      styleScore: scoreStyleForState(state, AI_TURNS.bear),
      state
    };
  });

  return candidates.sort((left, right) => compareHardCandidates(left, right, AI_TURNS.bear));
}

export function describeHunterSetupCandidates(lookupBearStartCandidates) {
  const candidates = HUNTER_LUNETTES.map((lunette) => {
    const bearCandidates = lookupBearStartCandidates(lunette);
    const bestBearReply = bearCandidates[0];
    return {
      lunette: [...lunette],
      moveCode: `setup:${lunette.join('-')}`,
      outcome: bestBearReply.outcome,
      distance: bestBearReply.distance,
      styleScore: scoreHunterSetupStyle(lunette),
      bestBearReply
    };
  });

  return candidates.sort((left, right) => compareHardCandidates(left, right, AI_TURNS.hunters));
}

export function compareHardCandidates(left, right, mover) {
  const outcomeDelta =
    moverOutcomeRank(right.outcome, mover) - moverOutcomeRank(left.outcome, mover);
  if (outcomeDelta !== 0) return outcomeDelta;

  const distanceDelta = compareDistanceForMover(left.distance, right.distance, left.outcome, mover);
  if (distanceDelta !== 0) return distanceDelta;

  if (right.styleScore !== left.styleScore) {
    return right.styleScore - left.styleScore;
  }

  return left.moveCode.localeCompare(right.moveCode);
}

export function moverOutcomeRank(outcome, mover) {
  if (mover === AI_TURNS.hunters) {
    return outcome === AI_OUTCOMES.huntersWin ? 1 : 0;
  }
  return outcome === AI_OUTCOMES.draw ? 1 : 0;
}

export function compareDistanceForMover(leftDistance, rightDistance, outcome, mover) {
  if (mover === AI_TURNS.hunters && outcome === AI_OUTCOMES.huntersWin) {
    return leftDistance - rightDistance;
  }
  return rightDistance - leftDistance;
}

export function distanceLossFromBest(candidate, best, mover) {
  if (candidate.outcome !== best.outcome) return Number.POSITIVE_INFINITY;
  if (mover === AI_TURNS.hunters && candidate.outcome === AI_OUTCOMES.huntersWin) {
    return Math.max(0, candidate.distance - best.distance);
  }
  return Math.max(0, best.distance - candidate.distance);
}

export function scoreStyleForState(state, mover) {
  const metrics = collectStateMetrics(state);

  if (mover === AI_TURNS.hunters) {
    return (
      -metrics.bearMobility * 300 +
      metrics.innerRingControl * 90 +
      metrics.gatewayControl * 80 +
      metrics.hunterAdjacency * 110 +
      metrics.sectorCoverage * 60 +
      metrics.centerDistance * 75 -
      metrics.outerEscapeRoutes * 220 -
      metrics.reachableOuterRing * 25 -
      metrics.cutoffDistance * 35
    );
  }

  return (
    metrics.bearMobility * 260 +
    metrics.outerEscapeRoutes * 220 +
    metrics.reachableOuterRing * 35 +
    metrics.centerDistance * 90 +
    metrics.cutoffDistance * 25 -
    metrics.innerRingControl * 70 -
    metrics.gatewayControl * 85 -
    metrics.hunterAdjacency * 130 -
    metrics.sectorCoverage * 30 -
    (state.bear === CENTER_NODE ? 120 : 0)
  );
}

export function collectStateMetrics(state) {
  const bearMoves = getBearLegalMovesForState(state);
  const reachableOuterRing = countReachableNodes(
    state,
    state.bear,
    3,
    (nodeId) => isOuterRingNode(nodeId)
  );
  const reachableGateways = countReachableNodes(
    state,
    state.bear,
    2,
    (nodeId) => isGatewayNode(nodeId)
  );
  const escapeTargets = new Set(
    [state.bear, ...bearMoves].filter((nodeId) => isOuterRingNode(nodeId) || isGatewayNode(nodeId))
  );

  return {
    bearMobility: bearMoves.length,
    centerDistance: graphDistance(state.bear, CENTER_NODE),
    innerRingControl: state.hunters.filter((nodeId) => isInnerRingNode(nodeId)).length,
    gatewayControl: state.hunters.filter((nodeId) => isGatewayNode(nodeId)).length,
    hunterAdjacency: state.hunters.filter((nodeId) => adjacency.get(state.bear)?.includes(nodeId)).length,
    sectorCoverage: countHunterSectorCoverage(state.hunters),
    reachableOuterRing,
    reachableGateways,
    outerEscapeRoutes: countOuterEscapeRoutes(state, bearMoves),
    cutoffDistance: sumHunterDistancesToTargets(state.hunters, escapeTargets)
  };
}

export function isCentralContestState(state) {
  if (CENTRAL_ZONE_NODES.includes(state.bear)) return true;
  return state.hunters.some((nodeId) => CENTRAL_ZONE_NODES.includes(nodeId) || OUTER_GATEWAYS.includes(nodeId));
}

export function isImmediateTrapState(state) {
  return getHunterLegalMovesForState(state).some((move) => {
    const next = applyVirtualMoveToState(state, AI_TURNS.hunters, move);
    return getBearLegalMovesForState(next).length === 0;
  });
}

export function isImmediateEscapeState(state, lookupStateInfo) {
  const candidates = describePlayingMoveCandidates(state, lookupStateInfo);
  if (candidates.length <= 1) return false;
  const bestOutcome = candidates[0].outcome;
  return candidates.some((candidate) => candidate.outcome !== bestOutcome);
}

export function hashStringFnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function positionSlot(comboIndex, bear) {
  return comboIndex * BOARD_NODE_IDS.length + bear;
}

function buildBoardSectorMap() {
  return new Map([
    [0, 'north'],
    [1, 'north'],
    [2, 'north'],
    [3, 'north'],
    [16, 'north'],
    [4, 'west'],
    [5, 'west'],
    [6, 'west'],
    [14, 'west'],
    [17, 'west'],
    [7, 'east'],
    [8, 'east'],
    [9, 'east'],
    [15, 'east'],
    [19, 'east'],
    [10, 'south'],
    [11, 'south'],
    [12, 'south'],
    [13, 'south'],
    [20, 'south'],
    [18, 'center']
  ]);
}

function countHunterSectorCoverage(hunters) {
  const sectors = new Set();
  for (const hunter of hunters) {
    const sector = BOARD_SECTOR_BY_NODE.get(hunter);
    if (!sector || sector === 'center') continue;
    sectors.add(sector);
  }
  return sectors.size;
}

function countReachableNodes(state, start, maxDepth, predicate) {
  if (!Number.isInteger(start)) return 0;
  const queue = [{ node: start, depth: 0 }];
  const visited = new Set([start]);
  let cursor = 0;
  let count = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (!current || current.depth >= maxDepth) continue;

    for (const next of adjacency.get(current.node) ?? []) {
      if (visited.has(next) || state.hunters.includes(next)) continue;
      visited.add(next);
      if (predicate(next)) count += 1;
      queue.push({ node: next, depth: current.depth + 1 });
    }
  }

  return count;
}

function countOuterEscapeRoutes(state, bearMoves) {
  return bearMoves.filter((nodeId) => {
    if (isOuterRingNode(nodeId)) return true;
    if (!isGatewayNode(nodeId)) return false;
    return (adjacency.get(nodeId) ?? []).some(
      (next) => isOuterRingNode(next) && next !== state.bear && !state.hunters.includes(next)
    );
  }).length;
}

function sumHunterDistancesToTargets(hunters, targets) {
  const targetNodes = [...targets];
  if (targetNodes.length === 0) return OUTER_RING_NODES.length * hunters.length;

  return hunters.reduce((sum, hunter) => {
    let best = Number.POSITIVE_INFINITY;
    for (const target of targetNodes) {
      best = Math.min(best, graphDistance(hunter, target));
    }
    return sum + (Number.isFinite(best) ? best : OUTER_RING_NODES.length);
  }, 0);
}

function scoreHunterSetupStyle(lunette) {
  const coverage = countHunterSectorCoverage(lunette);
  const gatewayDistance = lunette.reduce((sum, hunter) => {
    let best = Number.POSITIVE_INFINITY;
    for (const gateway of OUTER_GATEWAYS) {
      best = Math.min(best, graphDistance(hunter, gateway));
    }
    return sum + best;
  }, 0);

  return coverage * 50 - gatewayDistance * 20;
}
