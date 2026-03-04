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
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  dispatch(type) {
    const handler = this.listeners.get(type);
    if (handler) handler();
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

  globalThis.document = {
    getElementById(id) {
      return elements[id] ?? null;
    }
  };

  return elements;
}

function setupNavigator(registerMock) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      serviceWorker: {
        register: registerMock
      }
    }
  });
}

async function importMainWithMocks({ registerMock, state }) {
  vi.resetModules();
  const elements = setupDom();
  setupNavigator(registerMock);

  const gameMock = {
    newMatch: vi.fn(),
    getState: vi.fn(() => state.current),
    setOnChange: vi.fn(),
    clickNode: vi.fn()
  };

  const renderMock = vi.fn();

  vi.doMock('./game.js', () => ({
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

  it('avvia la partita su click di start e mostra la schermata gioco', async () => {
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

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvh', 'bear');
    expect(renderMock).toHaveBeenCalled();
    expect(elements.startScreen.classList.contains('is-hidden')).toBe(true);
    expect(elements.gameScreen.classList.contains('is-hidden')).toBe(false);
  });

  it('usa configurazione aggiornata per nuova partita (hvc + hunters)', async () => {
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

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvc', 'hunters');
  });

  it('aggiorna status quando il motore invoca onChange', async () => {
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
      message: 'Turno dell Orso'
    };

    onChange();

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(elements.roundLabel.textContent).toBe('Manche: 2/2');
    expect(elements.turnLabel.textContent).toBe("Turno: Orso");
    expect(elements.movesLabel.textContent).toBe('Mosse Orso: 12/40');
    expect(elements.messageLabel.textContent).toBe('Turno dell Orso');
    expect(elements.roundOneResult.textContent).toContain('in attesa');
    expect(elements.matchResultLabel.textContent).toContain('in attesa');
  });

  it('logga warning se la registrazione service worker fallisce', async () => {
    const state = {
      current: {
        round: 1,
        turn: 'hunters',
        bearMoves: 0,
        message: 'setup'
      }
    };

    const swError = new Error('sw failure');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await importMainWithMocks({
      registerMock: vi.fn(() => Promise.reject(swError)),
      state
    });

    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('[sw] registration failed');
    expect(warnSpy.mock.calls[0][1]).toBe(swError);
  });

  it('in hvc mostra Umano/Computer nel risultato finale', async () => {
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

    expect(elements.matchResultLabel.textContent).toContain('vince Umano');
    expect(elements.messageLabel.textContent).toContain('vince Umano');
  });
});
