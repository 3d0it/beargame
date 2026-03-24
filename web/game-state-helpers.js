export const BOARD_NODES = [
  { id: 0, x: 50, y: 7 },
  { id: 1, x: 28.5, y: 12.8 },
  { id: 2, x: 50, y: 22 },
  { id: 3, x: 71.5, y: 12.8 },
  { id: 4, x: 12.8, y: 28.5 },
  { id: 5, x: 22, y: 50 },
  { id: 6, x: 12.8, y: 71.5 },
  { id: 7, x: 87.2, y: 28.5 },
  { id: 8, x: 78, y: 50 },
  { id: 9, x: 87.2, y: 71.5 },
  { id: 10, x: 28.5, y: 87.2 },
  { id: 11, x: 50, y: 78 },
  { id: 12, x: 71.5, y: 87.2 },
  { id: 13, x: 50, y: 93 },
  { id: 14, x: 7, y: 50 },
  { id: 15, x: 93, y: 50 },
  { id: 16, x: 50, y: 35 },
  { id: 17, x: 35, y: 50 },
  { id: 18, x: 50, y: 50 },
  { id: 19, x: 65, y: 50 },
  { id: 20, x: 50, y: 65 }
];

export const EDGE_LIST = [
  [0, 3], [3, 7], [7, 15], [15, 9], [9, 12], [12, 13],
  [13, 10], [10, 6], [6, 14], [14, 4], [4, 1], [1, 0],
  [1, 2], [2, 3],
  [10, 11], [11, 12],
  [4, 5], [5, 6],
  [7, 8], [8, 9],
  [0, 2], [2, 16], [16, 18], [18, 20], [20, 11], [11, 13],
  [14, 5], [5, 17], [17, 18], [18, 19], [19, 8], [8, 15],
  [16, 19], [19, 20], [20, 17], [17, 16]
];

export const HUNTER_LUNETTES = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12]
];

export const MAX_BEAR_MOVES = 40;
export const CENTER_NODE = 18;
export const INNER_RING_NODES = [16, 17, 19, 20];
export const CENTRAL_ZONE_NODES = [16, 17, 18, 19, 20];
export const OUTER_GATEWAYS = [2, 5, 8, 11];
export const OUTER_RING_NODES = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 14, 15];
export const BOARD_NODE_IDS = BOARD_NODES.map((node) => node.id);
export const adjacency = buildAdjacency(EDGE_LIST);

const NODE_BY_ID = new Map(BOARD_NODES.map((node) => [node.id, node]));
const GRAPH_DISTANCE_MATRIX = buildGraphDistanceMatrix();

export function buildAdjacency(edges) {
  const map = new Map();
  for (const node of BOARD_NODES) map.set(node.id, []);
  for (const [a, b] of edges) {
    map.get(a).push(b);
    map.get(b).push(a);
  }
  return map;
}

export function cloneGameState(state) {
  return {
    ...state,
    hunters: [...state.hunters]
  };
}

export function sortHunters(hunters) {
  return [...hunters].sort((a, b) => a - b);
}

export function canonicalHuntersKey(hunters) {
  return sortHunters(hunters).join(',');
}

export function isOccupiedNode(state, nodeId) {
  return state.bear === nodeId || state.hunters.includes(nodeId);
}

export function getBearLegalMovesForState(state) {
  if (!Number.isInteger(state.bear)) return [];
  return (adjacency.get(state.bear) ?? []).filter((nodeId) => !isOccupiedNode(state, nodeId));
}

export function getHunterLegalMovesForState(state) {
  const moves = [];
  for (let hunterIndex = 0; hunterIndex < state.hunters.length; hunterIndex += 1) {
    const from = state.hunters[hunterIndex];
    if (!Number.isInteger(from)) continue;
    for (const to of adjacency.get(from) ?? []) {
      if (!isOccupiedNode(state, to)) {
        moves.push({ hunterIndex, from, to });
      }
    }
  }
  return moves;
}

export function applyVirtualMoveToState(state, side, move) {
  const next = cloneGameState(state);
  if (side === 'bear') {
    next.bear = move.to;
    next.bearMoves += 1;
    next.turn = 'hunters';
    return next;
  }

  next.hunters[move.hunterIndex] = move.to;
  next.turn = 'bear';
  return next;
}

export function nodeDistance(a, b) {
  const nodeA = NODE_BY_ID.get(a);
  const nodeB = NODE_BY_ID.get(b);
  if (!nodeA || !nodeB) return 0;
  return Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y);
}

export function graphDistance(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 0;
  const from = GRAPH_DISTANCE_MATRIX.get(a);
  if (!from) return 0;
  return from.get(b) ?? 0;
}

export function reachableCountForState(state, start, maxDepth) {
  if (start === null || start === undefined) return 0;
  const queue = [{ node: start, depth: 0 }];
  const visited = new Set([start]);
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (!current || current.depth >= maxDepth) continue;

    for (const next of adjacency.get(current.node) ?? []) {
      if (visited.has(next) || state.hunters.includes(next)) continue;
      visited.add(next);
      queue.push({ node: next, depth: current.depth + 1 });
    }
  }

  return visited.size;
}

export function isCentralZoneNode(nodeId) {
  return CENTRAL_ZONE_NODES.includes(nodeId);
}

export function isInnerRingNode(nodeId) {
  return INNER_RING_NODES.includes(nodeId);
}

export function isOuterRingNode(nodeId) {
  return OUTER_RING_NODES.includes(nodeId);
}

export function isGatewayNode(nodeId) {
  return OUTER_GATEWAYS.includes(nodeId);
}

export function validBearStartPositionsForHunters(hunters) {
  const state = {
    hunters: sortHunters(hunters),
    bear: null
  };

  return BOARD_NODE_IDS
    .filter((nodeId) => !state.hunters.includes(nodeId))
    .filter((nodeId) => {
      const candidate = {
        ...state,
        bear: nodeId
      };
      return getBearLegalMovesForState(candidate).length > 0;
    });
}

function buildGraphDistanceMatrix() {
  const matrix = new Map();

  for (const start of BOARD_NODE_IDS) {
    const distances = new Map([[start, 0]]);
    const queue = [start];
    let cursor = 0;

    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      const distance = distances.get(current) ?? 0;

      for (const next of adjacency.get(current) ?? []) {
        if (distances.has(next)) continue;
        distances.set(next, distance + 1);
        queue.push(next);
      }
    }

    matrix.set(start, distances);
  }

  return matrix;
}
