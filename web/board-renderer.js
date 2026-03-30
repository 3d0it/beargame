import { BOARD_NODES } from './game-state-helpers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LUNETTE_SETUP_GROUPS = [
  [1, 0, 3],
  [10, 13, 12],
  [4, 14, 6],
  [7, 15, 9]
];
const LUNETTE_ARC_GROUPS = [
  [1, 2, 3],
  [10, 11, 12],
  [4, 5, 6],
  [7, 8, 9]
];
const REQUIRED_LUNETTE_NODE_IDS = [...new Set([
  ...LUNETTE_SETUP_GROUPS.flat(),
  ...LUNETTE_ARC_GROUPS.flat()
])].sort((a, b) => a - b);

export function createBoardRenderer({ board, game, onAfterNodeClick }) {
  validateBoardRendererInput(board, game);

  const nodeMap = new Map(BOARD_NODES.map((node) => [node.id, node]));
  const lunetteResolution = resolveLunetteNodes(nodeMap);

  function render() {
    const state = game.getState();
    clearBoard(board);
    if (typeof board.setAttribute === 'function') {
      board.setAttribute('data-busy', state.aiThinking ? 'true' : 'false');
    }

    const isHuntersSetup = state.phase === 'setup-hunters';
    if (isHuntersSetup) {
      if (typeof board.setAttribute === 'function') {
        board.setAttribute('data-setup', 'hunters');
      }
    } else {
      if (typeof board.removeAttribute === 'function') {
        board.removeAttribute('data-setup');
      }
    }
    drawBoardLines(board, lunetteResolution, isHuntersSetup);
    if (isHuntersSetup) {
      drawLunetteGuides(board, nodeMap);
    }

    for (const node of BOARD_NODES) {
      const hit = createCircle(node.x, node.y, 4.8, 'node-hit');
      hit.addEventListener('click', () => {
        if (game.getState().aiThinking) return;
        game.clickNode(node.id);
        onAfterNodeClick?.();
      });
      board.appendChild(hit);

      const isSelectedHunter =
        state.selectedHunter !== null && state.hunters[state.selectedHunter] === node.id;
      const isThinkingBear = state.aiThinking && state.aiThinkingSide === 'bear';
      const isThinkingHunters = state.aiThinking && state.aiThinkingSide === 'hunters';
      const isBear = state.bear === node.id;
      const isHunter = state.hunters.includes(node.id);

      if (isBear) {
        board.appendChild(createBearToken(node.x, node.y, isThinkingBear));
        continue;
      }

      if (isHunter) {
        board.appendChild(createHunterToken(node.x, node.y, isSelectedHunter, isThinkingHunters));
        continue;
      }

      board.appendChild(createCircle(node.x, node.y, 2.8, 'node empty'));
    }
  }

  return { render };
}

function resolveLunetteNodes(nodeMap) {
  const resolved = new Map();
  const missingIds = [];

  for (const id of REQUIRED_LUNETTE_NODE_IDS) {
    const node = nodeMap.get(id);
    if (!node) {
      missingIds.push(id);
      continue;
    }
    resolved.set(id, node);
  }

  if (missingIds.length > 0) {
    console.error('[board] missing node ids for lunette rendering:', missingIds.join(', '));
    return { nodes: null, missingIds };
  }

  return {
    nodes: resolved,
    missingIds: []
  };
}

function drawBoardLines(board, lunetteResolution, isHuntersSetup = false) {
  board.appendChild(ellipse(50, 50, 43, 43));
  board.appendChild(ellipse(50, 50, 15, 15));
  board.appendChild(line(50, 7, 50, 93));
  board.appendChild(line(7, 50, 93, 50));

  if (!lunetteResolution.nodes) {
    drawLunetteWarning(board, lunetteResolution.missingIds);
    return;
  }

  for (const [startId, midpointId, endId] of LUNETTE_ARC_GROUPS) {
    const start = lunetteResolution.nodes.get(startId);
    const midpoint = lunetteResolution.nodes.get(midpointId);
    const end = lunetteResolution.nodes.get(endId);
    board.appendChild(curvePathThrough(
      start,
      midpoint,
      end,
      isHuntersSetup ? 'edge edge-lunette-guide' : 'edge'
    ));
  }

  if (!isHuntersSetup) return;

  for (const [startId, midpointId, endId] of LUNETTE_SETUP_GROUPS) {
    const start = lunetteResolution.nodes.get(startId);
    const midpoint = lunetteResolution.nodes.get(midpointId);
    const end = lunetteResolution.nodes.get(endId);
    board.appendChild(curvePathThrough(start, midpoint, end, 'edge edge-outer-lunette-guide'));
  }
}

function drawLunetteGuides(board, nodeMap) {
  for (const lunette of LUNETTE_SETUP_GROUPS) {
    for (const nodeId of lunette) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;
      board.appendChild(createCircle(node.x, node.y, 3.7, 'lunette-guide-node'));
    }
  }
}

function drawLunetteWarning(board, missingIds) {
  const warning = document.createElementNS(SVG_NS, 'text');
  warning.setAttribute('x', '50');
  warning.setAttribute('y', '97');
  warning.setAttribute('text-anchor', 'middle');
  warning.setAttribute('fill', '#ffd166');
  warning.setAttribute('font-size', '3');
  warning.setAttribute('data-warning', 'lunette-missing');
  warning.textContent = `Lunette non disponibili (${missingIds.join(',')})`;
  board.appendChild(warning);
}

function validateBoardRendererInput(board, game) {
  if (!board || typeof board.appendChild !== 'function' || !('innerHTML' in board)) {
    throw new Error('Invalid board element passed to createBoardRenderer');
  }

  if (!game || typeof game.getState !== 'function' || typeof game.clickNode !== 'function') {
    throw new Error('Invalid game object passed to createBoardRenderer');
  }
}

function clearBoard(board) {
  if (typeof board.replaceChildren === 'function') {
    board.replaceChildren();
    return;
  }
  board.innerHTML = '';
}

function line(x1, y1, x2, y2, cls = 'edge') {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.setAttribute('class', cls);
  return l;
}

function ellipse(cx, cy, rx, ry, cls = 'edge') {
  const e = document.createElementNS(SVG_NS, 'ellipse');
  e.setAttribute('cx', String(cx));
  e.setAttribute('cy', String(cy));
  e.setAttribute('rx', String(rx));
  e.setAttribute('ry', String(ry));
  e.setAttribute('class', cls);
  return e;
}

function curvePathThrough(start, midpoint, end, cls = 'edge') {
  const controlX = 2 * midpoint.x - (start.x + end.x) / 2;
  const controlY = 2 * midpoint.y - (start.y + end.y) / 2;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`);
  path.setAttribute('class', cls);
  return path;
}

function createCircle(cx, cy, r, cls) {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(r));
  c.setAttribute('class', cls);
  return c;
}

function createLine(x1, y1, x2, y2, cls) {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.setAttribute('class', cls);
  return l;
}

function createGroup(cls) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', cls);
  return g;
}

function createBearToken(x, y, thinking = false) {
  const g = createGroup('piece-group');
  if (thinking) {
    g.appendChild(createCircle(x, y, 4.55, 'piece-thinking-halo piece-thinking-halo-bear'));
    g.appendChild(createCircle(x, y, 4.05, 'piece-thinking piece-thinking-bear'));
  }
  g.appendChild(createCircle(x, y, 3.2, 'piece piece-bear'));
  g.appendChild(createCircle(x, y + 0.45, 0.95, 'piece-mark-bear'));
  g.appendChild(createCircle(x - 1.05, y - 0.9, 0.42, 'piece-mark-bear'));
  g.appendChild(createCircle(x, y - 1.2, 0.42, 'piece-mark-bear'));
  g.appendChild(createCircle(x + 1.05, y - 0.9, 0.42, 'piece-mark-bear'));
  return g;
}

function createHunterToken(x, y, selected, thinking = false) {
  const g = createGroup('piece-group');
  if (selected) {
    g.appendChild(createCircle(x, y, 3.95, 'piece-selected'));
  }
  if (thinking) {
    g.appendChild(createCircle(x, y, 4.55, 'piece-thinking-halo piece-thinking-halo-hunter'));
    g.appendChild(createCircle(x, y, 4.05, 'piece-thinking piece-thinking-hunter'));
  }
  g.appendChild(createCircle(x, y, 3.2, 'piece piece-hunter'));
  g.appendChild(createLine(x - 1.45, y, x + 1.45, y, 'piece-mark-hunter'));
  g.appendChild(createLine(x, y - 1.45, x, y + 1.45, 'piece-mark-hunter'));
  g.appendChild(createCircle(x, y, 0.5, 'piece-mark-hunter-dot'));
  return g;
}
