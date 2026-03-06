import { BOARD_NODES } from './game.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const REQUIRED_LUNETTE_NODE_IDS = [1, 3, 4, 6, 7, 9, 10, 12];
const LUNETTE_GROUPS = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12]
];

export function createBoardRenderer({ board, game, onAfterNodeClick }) {
  validateBoardRendererInput(board, game);

  const nodeMap = new Map(BOARD_NODES.map((node) => [node.id, node]));
  const lunetteResolution = resolveLunetteNodes(nodeMap);

  function render() {
    const state = game.getState();
    board.innerHTML = '';

    const isHuntersSetup = state.phase === 'setup-hunters';
    drawBoardLines(board, lunetteResolution, isHuntersSetup);
    if (isHuntersSetup) {
      drawLunetteGuides(board, nodeMap);
    }

    for (const node of BOARD_NODES) {
      const hit = createCircle(node.x, node.y, 4.8, 'node-hit');
      hit.addEventListener('click', () => {
        game.clickNode(node.id);
        render();
        onAfterNodeClick?.();
      });
      board.appendChild(hit);

      const isSelectedHunter =
        state.selectedHunter !== null && state.hunters[state.selectedHunter] === node.id;
      const isBear = state.bear === node.id;
      const isHunter = state.hunters.includes(node.id);

      if (isBear) {
        board.appendChild(createBearToken(node.x, node.y));
        continue;
      }

      if (isHunter) {
        board.appendChild(createHunterToken(node.x, node.y, isSelectedHunter));
        continue;
      }

      board.appendChild(createCircle(node.x, node.y, 2.8, 'node empty'));
    }
  }

  return { render };
}

function resolveLunetteNodes(nodeMap) {
  const resolved = [];
  const missingIds = [];

  for (const id of REQUIRED_LUNETTE_NODE_IDS) {
    const node = nodeMap.get(id);
    if (!node) {
      missingIds.push(id);
      continue;
    }
    resolved.push(node);
  }

  if (missingIds.length > 0) {
    console.error('[board] missing node ids for lunette rendering:', missingIds.join(', '));
    return { nodes: null, missingIds };
  }

  return {
    nodes: {
      n1: resolved[0],
      n3: resolved[1],
      n4: resolved[2],
      n6: resolved[3],
      n7: resolved[4],
      n9: resolved[5],
      n10: resolved[6],
      n12: resolved[7]
    },
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

  const lunetteNodes = lunetteResolution.nodes;
  board.appendChild(arcPath(lunetteNodes.n1.x, lunetteNodes.n1.y, lunetteNodes.n3.x, lunetteNodes.n3.y, 0, 30, isHuntersSetup));
  board.appendChild(arcPath(lunetteNodes.n10.x, lunetteNodes.n10.y, lunetteNodes.n12.x, lunetteNodes.n12.y, 1, 30, isHuntersSetup));
  board.appendChild(arcPath(lunetteNodes.n4.x, lunetteNodes.n4.y, lunetteNodes.n6.x, lunetteNodes.n6.y, 1, 30, isHuntersSetup));
  board.appendChild(arcPath(lunetteNodes.n7.x, lunetteNodes.n7.y, lunetteNodes.n9.x, lunetteNodes.n9.y, 0, 30, isHuntersSetup));
}

function drawLunetteGuides(board, nodeMap) {
  for (const lunette of LUNETTE_GROUPS) {
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

function line(x1, y1, x2, y2) {
  const l = document.createElementNS(SVG_NS, 'line');
  l.setAttribute('x1', String(x1));
  l.setAttribute('y1', String(y1));
  l.setAttribute('x2', String(x2));
  l.setAttribute('y2', String(y2));
  l.setAttribute('class', 'edge');
  return l;
}

function ellipse(cx, cy, rx, ry) {
  const e = document.createElementNS(SVG_NS, 'ellipse');
  e.setAttribute('cx', String(cx));
  e.setAttribute('cy', String(cy));
  e.setAttribute('rx', String(rx));
  e.setAttribute('ry', String(ry));
  e.setAttribute('class', 'edge');
  return e;
}

function arcPath(x1, y1, x2, y2, sweepFlag, radius = 30, highlight = false) {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweepFlag} ${x2} ${y2}`);
  path.setAttribute('class', highlight ? 'edge edge-lunette-guide' : 'edge');
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

function createBearToken(x, y) {
  const g = createGroup('piece-group');
  g.appendChild(createCircle(x, y, 3.2, 'piece piece-bear'));
  g.appendChild(createCircle(x, y + 0.45, 0.95, 'piece-mark-bear'));
  g.appendChild(createCircle(x - 1.05, y - 0.9, 0.42, 'piece-mark-bear'));
  g.appendChild(createCircle(x, y - 1.2, 0.42, 'piece-mark-bear'));
  g.appendChild(createCircle(x + 1.05, y - 0.9, 0.42, 'piece-mark-bear'));
  return g;
}

function createHunterToken(x, y, selected) {
  const g = createGroup('piece-group');
  if (selected) {
    g.appendChild(createCircle(x, y, 3.95, 'piece-selected'));
  }
  g.appendChild(createCircle(x, y, 3.2, 'piece piece-hunter'));
  g.appendChild(createLine(x - 1.45, y, x + 1.45, y, 'piece-mark-hunter'));
  g.appendChild(createLine(x, y - 1.45, x, y + 1.45, 'piece-mark-hunter'));
  g.appendChild(createCircle(x, y, 0.5, 'piece-mark-hunter-dot'));
  return g;
}
