import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeClassList {
  constructor(initial = []) {
    this.set = new Set(initial);
  }

  add(...classes) {
    for (const cls of classes) this.set.add(cls);
  }

  remove(...classes) {
    for (const cls of classes) this.set.delete(cls);
  }

  contains(cls) {
    return this.set.has(cls);
  }

  toggle(cls, force) {
    if (force === true) {
      this.set.add(cls);
      return true;
    }
    if (force === false) {
      this.set.delete(cls);
      return false;
    }
    if (this.set.has(cls)) {
      this.set.delete(cls);
      return false;
    }
    this.set.add(cls);
    return true;
  }
}

class FakeElement {
  constructor(id, initialClasses = []) {
    this.id = id;
    this.classList = new FakeClassList(initialClasses);
    this.listeners = new Map();
    this.textContent = '';
    this.style = {};
    this.clientWidth = 420;
    this._closest = null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type) {
    const handler = this.listeners.get(type);
    if (handler) handler();
  }

  closest(selector) {
    if (selector === '.board-panel') return this._closest;
    return null;
  }
}

const REQUIRED_IDS = [
  'board',
  'startScreen',
  'gameScreen',
  'modeHvHBtn',
  'modeHvCBtn',
  'computerSidePanel',
  'computerBearBtn',
  'computerHuntersBtn',
  'difficultyPanel',
  'difficultyEasyBtn',
  'difficultyMediumBtn',
  'difficultyHardBtn',
  'startMatchBtn',
  'backToMenuBtn',
  'newMatchBtn',
  'gameModeLabel',
  'roundLabel',
  'turnLabel',
  'movesLabel',
  'messageLabel',
  'resultBanner',
  'roundOneResult',
  'roundTwoResult',
  'matchResultLabel'
];

function setupDom() {
  const elements = {};
  for (const id of REQUIRED_IDS) {
    const classes = id === 'gameScreen' ? ['is-hidden'] : [];
    elements[id] = new FakeElement(id, classes);
  }
  elements.computerSidePanel.classList.add('is-hidden');
  elements.difficultyPanel.classList.add('is-hidden');

  globalThis.document = {
    getElementById(id) {
      return elements[id] ?? null;
    }
  };

  const boardPanel = new FakeElement('boardPanel');
  boardPanel.clientWidth = 520;
  boardPanel.getBoundingClientRect = () => ({ top: 100, width: 520 });
  elements.board._closest = boardPanel;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      innerHeight: 920,
      innerWidth: 1200,
      addEventListener: vi.fn(),
      getComputedStyle: vi.fn(() => ({
        paddingLeft: '10',
        paddingRight: '10'
      })),
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn()
      }
    }
  });

  return elements;
}

function setupNavigator(registerMock) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: registerMock ? { register: registerMock } : undefined
    }
  });
}

async function importMainWithMocks({ registerMock, state, storedSettingsRaw = null }) {
  vi.resetModules();
  const elements = setupDom();
  window.localStorage.getItem.mockReturnValue(storedSettingsRaw);
  setupNavigator(registerMock);

  const gameMock = {
    newMatch: vi.fn(),
    getState: vi.fn(() => state.current),
    setOnChange: vi.fn(),
    clickNode: vi.fn()
  };

  const renderMock = vi.fn();

  vi.doMock('./game.js', () => ({
    MAX_BEAR_MOVES: 40,
    createGame: () => gameMock
  }));

  vi.doMock('./board-renderer.js', () => ({
    createBoardRenderer: vi.fn(() => ({ render: renderMock }))
  }));

  await import('./main.js');

  return { elements, gameMock, renderMock };
}

describe('main.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts the match on start click and shows the game screen', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'I Cacciatori devono scegliere una lunetta iniziale.'
      }
    };

    const { elements, gameMock, renderMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    elements.startMatchBtn.dispatch('click');

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvh', 'bear', 'easy');
    expect(renderMock).toHaveBeenCalled();
    expect(elements.startScreen.classList.contains('is-hidden')).toBe(true);
    expect(elements.gameScreen.classList.contains('is-hidden')).toBe(false);
  });

  it('uses the updated configuration for a new match (hvc + hunters)', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    elements.modeHvCBtn.dispatch('click');
    expect(elements.computerSidePanel.classList.contains('is-hidden')).toBe(false);
    elements.computerHuntersBtn.dispatch('click');
    elements.newMatchBtn.dispatch('click');

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvc', 'hunters', 'easy');
  });

  it('applies the selected difficulty in versus-AI mode', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    elements.modeHvCBtn.dispatch('click');
    expect(elements.difficultyPanel.classList.contains('is-hidden')).toBe(false);
    elements.difficultyHardBtn.dispatch('click');
    elements.startMatchBtn.dispatch('click');

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvc', 'bear', 'hard');
  });

  it('loads valid persisted settings from localStorage', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state,
      storedSettingsRaw: JSON.stringify({ mode: 'hvc', computerSide: 'hunters', difficulty: 'hard' })
    });

    expect(elements.computerSidePanel.classList.contains('is-hidden')).toBe(false);
    expect(elements.difficultyPanel.classList.contains('is-hidden')).toBe(false);
    expect(elements.computerHuntersBtn.classList.contains('is-active')).toBe(true);
    expect(elements.difficultyHardBtn.classList.contains('is-active')).toBe(true);
  });

  it('uses a safe fallback if localStorage contains corrupted JSON', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state,
      storedSettingsRaw: '{bad-json'
    });

    expect(elements.modeHvHBtn.classList.contains('is-active')).toBe(true);
    expect(elements.computerBearBtn.classList.contains('is-active')).toBe(true);
    expect(elements.difficultyEasyBtn.classList.contains('is-active')).toBe(true);
  });

  it('updates status when the engine invokes onChange', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'iniziale'
      }
    };

    const { elements, gameMock, renderMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    state.current = {
      round: 2,
      turn: 'bear',
      bearMoves: 12,
      turnHintCode: 'bear-turn',
      validationErrorCode: null,
      message: 'Turno dell Orso: seleziona una casella adiacente libera.'
    };

    onChange();

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(elements.roundLabel.textContent).toBe('Manche 2/2');
    expect(elements.turnLabel.textContent).toBe('Orso');
    expect(elements.movesLabel.textContent).toBe('Mosse 12/40');
    expect(elements.messageLabel.textContent).toBe('Orso: scegli una casella adiacente libera.');
    expect(elements.roundOneResult.textContent).toContain('in attesa');
    expect(elements.matchResultLabel.textContent).toContain('Finale: in attesa');
  });

  it('does not register a service worker during bootstrap', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const registerMock = vi.fn(() => Promise.resolve());

    await importMainWithMocks({
      registerMock,
      state
    });

    expect(registerMock).not.toHaveBeenCalled();
  });

  it('shows an explicit message when the AI is thinking', async () => {
    const state = {
      current: {
        mode: 'hvc',
        computerSide: 'bear',
        round: 1,
        phase: 'playing',
        turn: 'bear',
        aiThinking: true,
        aiThinkingSide: 'hunters',
        bearMoves: 8,
        message: 'Turno dei Cacciatori'
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    onChange();

    expect(elements.messageLabel.textContent).toBe('IA sta pensando per i Cacciatori...');
  });

  it('shows Human/AI in the final result for hvc', async () => {
    const state = {
      current: {
        mode: 'hvc',
        computerSide: 'bear',
        round: 2,
        phase: 'match-over',
        turn: null,
        bearMoves: 12,
        message: 'Partita conclusa',
        matchSummary: { isTie: false, winnerPlayer: 'player-2' },
        roundResults: [
          {
            round: 1,
            reason: 'draw',
            immobilizationMoves: null,
            bearPlayer: 'player-1',
            huntersPlayer: 'player-2'
          },
          {
            round: 2,
            reason: 'hunters-win',
            immobilizationMoves: 12,
            bearPlayer: 'player-2',
            huntersPlayer: 'player-1'
          }
        ]
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    onChange();

    expect(elements.matchResultLabel.textContent).toContain('Finale: Vince Umano');
    expect(elements.messageLabel.textContent).toContain('Partita conclusa');
  });

  it('distinguishes when the loser also trapped the bear in the final summary', async () => {
    const state = {
      current: {
        mode: 'hvc',
        computerSide: 'bear',
        round: 2,
        phase: 'match-over',
        turn: null,
        bearMoves: 34,
        message: 'Partita conclusa',
        matchSummary: { isTie: false, winnerPlayer: 'player-2' },
        roundResults: [
          {
            round: 1,
            reason: 'hunters-win',
            immobilizationMoves: 23,
            bearPlayer: 'player-1',
            huntersPlayer: 'player-2'
          },
          {
            round: 2,
            reason: 'hunters-win',
            immobilizationMoves: 34,
            bearPlayer: 'player-2',
            huntersPlayer: 'player-1'
          }
        ]
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    onChange();

    expect(elements.matchResultLabel.textContent).toContain('Finale: Vince Umano (23), IA 34');
    expect(elements.matchResultLabel.textContent).not.toContain('>40');
  });

  it('avoids inconsistent copy when moves are missing in the losing round', async () => {
    const state = {
      current: {
        mode: 'hvc',
        computerSide: 'bear',
        round: 2,
        phase: 'match-over',
        turn: null,
        bearMoves: 23,
        message: 'Partita conclusa',
        matchSummary: { isTie: false, winnerPlayer: 'player-2' },
        roundResults: [
          {
            round: 1,
            reason: 'hunters-win',
            immobilizationMoves: 23,
            bearPlayer: 'player-1',
            huntersPlayer: 'player-2'
          },
          {
            round: 2,
            reason: 'hunters-win',
            immobilizationMoves: null,
            bearPlayer: 'player-2',
            huntersPlayer: 'player-1'
          }
        ]
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    onChange();

    expect(elements.matchResultLabel.textContent).toContain('Finale: Vince Umano (23), IA n/d');
    expect(elements.matchResultLabel.textContent).not.toContain('null mosse');
  });

  it('handles tie results and the latest outcome in the banner', async () => {
    const state = {
      current: {
        mode: 'hvh',
        round: 2,
        phase: 'tie-after-two-rounds',
        turn: null,
        bearMoves: 40,
        message: 'fine',
        matchSummary: { isTie: true, winnerPlayer: null },
        lastRoundResult: {
          round: 2,
          reason: 'draw',
          immobilizationMoves: null,
          bearPlayer: 'player-2',
          huntersPlayer: 'player-1'
        },
        roundResults: [
          {
            round: 1,
            reason: 'draw',
            immobilizationMoves: null,
            bearPlayer: 'player-1',
            huntersPlayer: 'player-2'
          },
          {
            round: 2,
            reason: 'draw',
            immobilizationMoves: null,
            bearPlayer: 'player-2',
            huntersPlayer: 'player-1'
          }
        ]
      }
    };

    const { elements, gameMock } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    const onChange = gameMock.setOnChange.mock.calls[0][0];
    onChange();

    expect(elements.resultBanner.textContent).toContain('parità');
    expect(elements.resultBanner.classList.contains('tie')).toBe(true);
    expect(elements.turnLabel.textContent).toBe('-');
    expect(elements.messageLabel.textContent).toContain('Partita conclusa');
  });

  it('returns to the menu with the Change mode button', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    elements.startMatchBtn.dispatch('click');
    expect(elements.gameScreen.classList.contains('is-hidden')).toBe(false);
    elements.backToMenuBtn.dispatch('click');
    expect(elements.gameScreen.classList.contains('is-hidden')).toBe(true);
    expect(elements.startScreen.classList.contains('is-hidden')).toBe(false);
  });

  it('does not attempt registration when service workers are unavailable', async () => {
    vi.resetModules();
    const elements = setupDom();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });

    const gameMock = {
      newMatch: vi.fn(),
      getState: vi.fn(() => ({
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      })),
      setOnChange: vi.fn(),
      clickNode: vi.fn()
    };
    const renderMock = vi.fn();

    vi.doMock('./game.js', () => ({
      MAX_BEAR_MOVES: 40,
      createGame: () => gameMock
    }));
    vi.doMock('./board-renderer.js', () => ({
      createBoardRenderer: vi.fn(() => ({ render: renderMock }))
    }));

    await import('./main.js');

    expect(elements.startScreen.classList.contains('is-hidden')).toBe(false);
    expect(gameMock.setOnChange).toHaveBeenCalledTimes(1);
  });

  it('does not apply inline board resizing (sizing is handled by CSS)', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const { elements } = await importMainWithMocks({
      registerMock: vi.fn(() => Promise.resolve()),
      state
    });

    elements.startMatchBtn.dispatch('click');

    expect(elements.board.style.width).toBeUndefined();
    expect(elements.board.style.height).toBeUndefined();
  });

  it('does not fail when navigator does not exist', async () => {
    vi.resetModules();
    setupDom();
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined
    });

    const gameMock = {
      newMatch: vi.fn(),
      getState: vi.fn(() => ({
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      })),
      setOnChange: vi.fn(),
      clickNode: vi.fn()
    };

    vi.doMock('./game.js', () => ({
      MAX_BEAR_MOVES: 40,
      createGame: () => gameMock
    }));
    vi.doMock('./board-renderer.js', () => ({
      createBoardRenderer: vi.fn(() => ({ render: vi.fn() }))
    }));

    await import('./main.js');
    expect(gameMock.setOnChange).toHaveBeenCalledTimes(1);
  });
});
