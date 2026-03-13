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
  'difficultyMasterBtn',
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
      serviceWorker: {
        register: registerMock
      }
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

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvh', 'bear', 'easy');
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

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvc', 'hunters', 'easy');
  });

  it('applica la difficolta selezionata in modalita contro pc', async () => {
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
    elements.difficultyMasterBtn.dispatch('click');
    elements.startMatchBtn.dispatch('click');

    expect(gameMock.newMatch).toHaveBeenCalledWith('hvc', 'bear', 'master');
  });

  it('carica impostazioni persistite valide da localStorage', async () => {
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
      storedSettingsRaw: JSON.stringify({ mode: 'hvc', computerSide: 'hunters', difficulty: 'master' })
    });

    expect(elements.computerSidePanel.classList.contains('is-hidden')).toBe(false);
    expect(elements.difficultyPanel.classList.contains('is-hidden')).toBe(false);
    expect(elements.computerHuntersBtn.classList.contains('is-active')).toBe(true);
    expect(elements.difficultyMasterBtn.classList.contains('is-active')).toBe(true);
  });

  it('usa fallback safe se localStorage contiene JSON corrotto', async () => {
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

  it('in hvc mostra Umano/IA nel risultato finale', async () => {
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

  it('nel riepilogo finale distingue quando anche il perdente immobilizza l orso', async () => {
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

  it('evita copy incoerente con mosse mancanti nel round del perdente', async () => {
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

  it('gestisce risultati tie e ultimo esito nel banner', async () => {
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

  it('torna al menu con pulsante Cambia modalità', async () => {
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

  it('in assenza di service worker non tenta la registrazione', async () => {
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

  it('non applica resize inline del board (sizing gestito da CSS)', async () => {
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

  it('non fallisce quando navigator non esiste', async () => {
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
