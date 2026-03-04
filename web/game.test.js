import { describe, expect, it, vi } from 'vitest';
import { controllerFor, createGame, summarizeMatch } from './game.js';

function playDrawRound(game, { lunetteNode = 8, bearStart = 18 } = {}) {
  let state = game.getState();
  if (state.phase === 'setup-hunters') game.clickNode(lunetteNode);
  state = game.getState();
  if (state.phase === 'setup-bear') game.clickNode(bearStart);
  state = game.getState();

  const lunetteKey = [...state.hunters].sort((a, b) => a - b).join(',');
  const togglesByLunette = {
    '1,2,3': [2, 0],
    '4,5,6': [5, 14],
    '7,8,9': [8, 15],
    '10,11,12': [11, 13]
  };
  const [toggleA, toggleB] = togglesByLunette[lunetteKey] ?? [state.hunters[0], state.hunters[0]];

  for (let i = 0; i < 40; i += 1) {
    const current = game.getState();
    if (current.phase !== 'playing') break;

    const bearTarget = current.bear === 18 ? 16 : 18;
    game.clickNode(bearTarget);

    const afterBear = game.getState();
    if (afterBear.phase !== 'playing') break;

    const hunterPos = afterBear.hunters.includes(toggleA) ? toggleA : toggleB;
    const hunterTarget = hunterPos === toggleA ? toggleB : toggleA;
    game.clickNode(hunterPos);
    game.clickNode(hunterTarget);
  }
}

describe('controllerFor', () => {
  it('in hvh lascia sempre il controllo all umano', () => {
    expect(controllerFor({ mode: 'hvh', computerSide: 'bear', round: 1, side: 'bear' })).toBe('human');
    expect(controllerFor({ mode: 'hvh', computerSide: 'hunters', round: 2, side: 'hunters' })).toBe('human');
  });

  it('in hvc scambia i ruoli nella seconda manche', () => {
    expect(controllerFor({ mode: 'hvc', computerSide: 'bear', round: 1, side: 'bear' })).toBe('computer');
    expect(controllerFor({ mode: 'hvc', computerSide: 'bear', round: 1, side: 'hunters' })).toBe('human');
    expect(controllerFor({ mode: 'hvc', computerSide: 'bear', round: 2, side: 'bear' })).toBe('human');
    expect(controllerFor({ mode: 'hvc', computerSide: 'bear', round: 2, side: 'hunters' })).toBe('computer');
  });
});

describe('createGame', () => {
  it('inizializza una nuova partita con setup corretto', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    const state = game.getState();

    expect(state.phase).toBe('setup-hunters');
    expect(state.turn).toBe('hunters');
    expect(state.hunters).toEqual([]);
    expect(state.bear).toBeNull();
    expect(state.round).toBe(1);
  });

  it('getState restituisce uno snapshot e non espone mutabilita interna', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');

    const snapshot = game.getState();
    snapshot.mode = 'hvc';
    snapshot.hunters.push(99);
    snapshot.roundResults.push({ round: 9, reason: 'draw' });

    const current = game.getState();
    expect(current.mode).toBe('hvh');
    expect(current.hunters).toEqual([]);
    expect(current.roundResults).toEqual([]);
  });

  it('i cacciatori scelgono una lunetta iniziale prima del setup orso', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(8);

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters).toEqual([7, 8, 9]);
  });

  it('in setup cacciatori ignora nodi fuori lunetta', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(18);

    const state = game.getState();
    expect(state.phase).toBe('setup-hunters');
    expect(state.hunters).toEqual([]);
  });

  it('non permette all orso di partire su una posizione occupata', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(1);

    game.clickNode(1);
    expect(game.getState().bear).toBeNull();

    game.clickNode(18);
    expect(game.getState().bear).toBe(18);
    expect(game.getState().phase).toBe('playing');
  });

  it('applica una mossa valida dell orso e una dei cacciatori', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(1);
    game.clickNode(18);

    game.clickNode(16);
    let state = game.getState();
    expect(state.bear).toBe(16);
    expect(state.bearMoves).toBe(1);
    expect(state.turn).toBe('hunters');

    game.clickNode(1);
    game.clickNode(0);
    state = game.getState();
    expect(state.hunters).toContain(0);
    expect(state.hunters).not.toContain(1);
    expect(state.turn).toBe('bear');
  });

  it('ignora una mossa orso non adiacente', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(1);
    game.clickNode(18);

    game.clickNode(0);
    const state = game.getState();
    expect(state.bear).toBe(18);
    expect(state.turn).toBe('bear');
    expect(state.bearMoves).toBe(0);
  });

  it('mantiene selezione cacciatore se la destinazione non e valida', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    game.clickNode(1);
    game.clickNode(18);
    game.clickNode(16);

    game.clickNode(1);
    game.clickNode(14);

    const state = game.getState();
    expect(state.selectedHunter).toBe(0);
    expect(state.hunters).toEqual([1, 2, 3]);
    expect(state.turn).toBe('hunters');
  });

  it('chiude il primo round in patta dopo 40 mosse orso e passa al round 2', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');
    playDrawRound(game);

    const state = game.getState();
    expect(state.round).toBe(2);
    expect(state.phase).toBe('setup-hunters');
    expect(state.roundResults).toHaveLength(1);
    expect(state.roundResults[0].reason).toBe('draw');
    expect(state.roundResults[0].huntersPlayer).toBe('player-2');
    expect(state.lastRoundResult?.round).toBe(1);
    expect(state.message).toContain('Manche 1 conclusa: patta');
    expect(state.turn).toBe('hunters');
  });

  it('dopo due round patta entra in tie-after-two-rounds', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear');

    playDrawRound(game);
    playDrawRound(game, { lunetteNode: 5 });

    const state = game.getState();
    expect(state.round).toBe(2);
    expect(state.phase).toBe('tie-after-two-rounds');
    expect(state.turn).toBeNull();
    expect(state.roundResults).toHaveLength(2);
    expect(state.matchSummary?.isTie).toBe(true);
    expect(state.message).toContain('Risultato finale: parità');
  });

  it('in hvc con computer cacciatori seleziona automaticamente una lunetta', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters');

    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters.length).toBe(3);
    expect(state.bear).toBeNull();

    vi.useRealTimers();
  });

  it('in setup cacciatori con computer ignora click umano prima del timer', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters');

    game.clickNode(1);
    expect(game.getState().hunters).toEqual([]);

    vi.runOnlyPendingTimers();
    expect(game.getState().hunters.length).toBe(3);

    vi.useRealTimers();
  });

  it('ignora timer pendenti della partita precedente quando parte una nuova partita', () => {
    vi.useFakeTimers();
    const game = createGame();

    game.newMatch('hvc', 'hunters');
    game.newMatch('hvh', 'bear');

    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.mode).toBe('hvh');
    expect(state.phase).toBe('setup-hunters');
    expect(state.hunters).toEqual([]);

    vi.useRealTimers();
  });

  it('in hvc con computer orso esegue setup e prima mossa dopo la scelta lunetta', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'bear');
    game.clickNode(1);

    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.phase).toBe('playing');
    expect(state.bear).not.toBeNull();
    expect(state.turn).toBe('hunters');
    expect(state.bearMoves).toBe(1);

    vi.useRealTimers();
  });

  it('se un solo giocatore immobilizza l orso, il riepilogo finale non usa punteggi fittizi', () => {
    const summary = summarizeMatch([
      {
        round: 1,
        reason: 'hunters-win',
        immobilizationMoves: 12,
        bearPlayer: 'player-2',
        huntersPlayer: 'player-1'
      },
      {
        round: 2,
        reason: 'draw',
        immobilizationMoves: null,
        bearPlayer: 'player-1',
        huntersPlayer: 'player-2'
      }
    ]);

    expect(summary.isTie).toBe(false);
    expect(summary.winnerPlayer).toBe('player-1');
    expect(summary.message).not.toContain('999');
    expect(summary.message).toContain('Partita conclusa');
  });
});
