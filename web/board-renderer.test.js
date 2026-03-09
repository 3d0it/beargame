import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_NODES } from './game.js';
import { createBoardRenderer } from './board-renderer.js';

class FakeSvgElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.textContent = '';
    this._innerHTML = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  trigger(type) {
    const handler = this.listeners.get(type);
    if (handler) handler();
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function makeFakeDom() {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElementNS(_ns, tagName) {
      return new FakeSvgElement(tagName);
    }
  };
  return () => {
    globalThis.document = originalDocument;
  };
}

function visit(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = visit(child, predicate);
    if (found) return found;
  }
  return null;
}

function collect(root, predicate, acc = []) {
  if (predicate(root)) acc.push(root);
  for (const child of root.children) {
    collect(child, predicate, acc);
  }
  return acc;
}

describe('createBoardRenderer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valida board e game in input', () => {
    const restore = makeFakeDom();

    expect(() => createBoardRenderer({ board: null, game: {} })).toThrow('Invalid board element');

    const board = new FakeSvgElement('svg');
    expect(() => createBoardRenderer({ board, game: {} })).toThrow('Invalid game object');

    restore();
  });

  it('renderizza warning visibile quando mancano nodi lunetta', () => {
    const restore = makeFakeDom();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const removedIndex = BOARD_NODES.findIndex((node) => node.id === 12);
    const [removedNode] = BOARD_NODES.splice(removedIndex, 1);

    const board = new FakeSvgElement('svg');
    const game = {
      getState: () => ({ bear: null, hunters: [], selectedHunter: null }),
      clickNode: vi.fn()
    };

    try {
      const renderer = createBoardRenderer({ board, game });
      renderer.render();

      const warning = visit(board, (el) => el.tagName === 'text' && el.getAttribute('data-warning') === 'lunette-missing');
      expect(warning).not.toBeNull();
      expect(warning.textContent).toContain('12');
      expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      BOARD_NODES.splice(removedIndex, 0, removedNode);
      restore();
    }
  });

  it('gestisce click nodo, invoca game.clickNode e callback', () => {
    const restore = makeFakeDom();

    let state = { bear: null, hunters: [], selectedHunter: null };
    const clickNode = vi.fn((id) => {
      if (id === 17) state = { ...state, bear: 17 };
    });

    const game = {
      getState: () => state,
      clickNode
    };

    const board = new FakeSvgElement('svg');
    const afterClick = vi.fn();
    const renderer = createBoardRenderer({ board, game, onAfterNodeClick: afterClick });

    renderer.render();

    const hit = visit(
      board,
      (el) =>
        el.tagName === 'circle' &&
        el.getAttribute('class') === 'node-hit' &&
        el.getAttribute('cx') === '35' &&
        el.getAttribute('cy') === '50'
    );

    expect(hit).not.toBeNull();
    hit.trigger('click');

    expect(clickNode).toHaveBeenCalledWith(17);
    expect(afterClick).toHaveBeenCalledTimes(1);

    renderer.render();
    const hasBearPiece = visit(board, (el) => el.getAttribute('class') === 'piece piece-bear');
    expect(hasBearPiece).not.toBeNull();

    restore();
  });

  it('in setup cacciatori evidenzia lunette con archi e nodi guida', () => {
    const restore = makeFakeDom();
    const board = new FakeSvgElement('svg');
    const game = {
      getState: () => ({ bear: null, hunters: [], selectedHunter: null, phase: 'setup-hunters' }),
      clickNode: vi.fn()
    };

    const renderer = createBoardRenderer({ board, game });
    renderer.render();

    const highlightedArcs = collect(
      board,
      (el) => el.tagName === 'path' && (el.getAttribute('class') || '').includes('edge-lunette-guide')
    );
    const guideNodes = collect(board, (el) => el.getAttribute('class') === 'lunette-guide-node');

    expect(highlightedArcs).toHaveLength(4);
    expect(guideNodes).toHaveLength(12);
    restore();
  });
});
