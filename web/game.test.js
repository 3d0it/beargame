import { describe, expect, it, vi } from 'vitest';
import { createGame, summarizeMatch } from './game.js';

function playDrawRound(game, { lunetteNode = 8, bearStart = 18 } = {}) {
  let state = game.getState();
  if (state.phase === 'setup-hunters') game.clickNode(lunetteNode);
  state = game.getState();
  if (state.phase === 'setup-bear') game.clickNode(bearStart);

  const togglesByLunette = {
    '1,2,3': [2, 0],
    '4,5,6': [5, 14],
    '7,8,9': [8, 15],
    '10,11,12': [11, 13]
  };
  const current = game.getState();
  const lunetteKey = [...current.hunters].sort((a, b) => a - b).join(',');
  const [toggleA, toggleB] = togglesByLunette[lunetteKey] ?? [current.hunters[0], current.hunters[0]];

  for (let index = 0; index < 40; index += 1) {
    const beforeBear = game.getState();
    if (beforeBear.phase !== 'playing') break;

    const bearTarget = beforeBear.bear === 18 ? 16 : 18;
    game.clickNode(bearTarget);

    const afterBear = game.getState();
    if (afterBear.phase !== 'playing') break;

    const hunterPos = afterBear.hunters.includes(toggleA) ? toggleA : toggleB;
    const hunterTarget = hunterPos === toggleA ? toggleB : toggleA;
    game.clickNode(hunterPos);
    game.clickNode(hunterTarget);
  }
}

describe('createGame', () => {
  it('inizializza una nuova partita con setup corretto', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    const state = game.getState();

    expect(state.phase).toBe('setup-hunters');
    expect(state.turn).toBe('hunters');
    expect(state.hunters).toEqual([]);
    expect(state.bear).toBeNull();
    expect(state.round).toBe(1);
  });

  it('salva la difficolta selezionata e usa easy come fallback', () => {
    const game = createGame();
    game.newMatch('hvc', 'bear', 'hard');
    expect(game.getState().difficulty).toBe('hard');

    game.newMatch('hvc', 'bear', 'impossible');
    expect(game.getState().difficulty).toBe('easy');
  });

  it('getState restituisce uno snapshot non mutabile dall esterno', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');

    const snapshot = game.getState();
    snapshot.mode = 'hvc';
    snapshot.hunters.push(99);
    snapshot.roundResults.push({ round: 9, reason: 'draw' });

    const current = game.getState();
    expect(current.mode).toBe('hvh');
    expect(current.hunters).toEqual([]);
    expect(current.roundResults).toEqual([]);
  });

  it('i cacciatori scelgono una lunetta iniziale valida', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');

    game.clickNode(8);

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters).toEqual([7, 8, 9]);
  });

  it('non permette all orso di partire su una posizione occupata o senza mosse', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);

    game.clickNode(1);
    expect(game.getState().bear).toBeNull();

    game.clickNode(0);
    expect(game.getState().bear).toBeNull();
    expect(game.getState().message).toContain('Posizione iniziale non valida');
  });

  it('applica una mossa valida dell orso e una dei cacciatori', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);
    game.clickNode(18);

    game.clickNode(16);
    let state = game.getState();
    expect(state.bear).toBe(16);
    expect(state.turn).toBe('hunters');
    expect(state.bearMoves).toBe(1);

    game.clickNode(1);
    game.clickNode(0);
    state = game.getState();
    expect(state.hunters).toContain(0);
    expect(state.turn).toBe('bear');
  });

  it('mantiene selezione cacciatore e mostra errore su destinazione invalida', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);
    game.clickNode(18);
    game.clickNode(16);

    game.clickNode(1);
    game.clickNode(14);

    const state = game.getState();
    expect(state.selectedHunter).toBe(0);
    expect(state.turn).toBe('hunters');
    expect(state.message).toContain('Mossa non valida');
  });

  it('chiude il primo round in patta dopo 40 mosse orso e passa al round 2', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');

    playDrawRound(game);

    const state = game.getState();
    expect(state.round).toBe(2);
    expect(state.phase).toBe('setup-hunters');
    expect(state.roundResults).toHaveLength(1);
    expect(state.roundResults[0].reason).toBe('draw');
  });

  it('in hvc con IA cacciatori sceglie la lunetta automaticamente', () => {
    vi.useFakeTimers();
    const game = createGame();

    game.newMatch('hvc', 'hunters', 'easy');
    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters).toHaveLength(3);

    vi.useRealTimers();
  });

  it('in hvc con IA orso esegue setup e prima mossa dopo la scelta lunetta', () => {
    vi.useFakeTimers();
    const game = createGame();

    game.newMatch('hvc', 'bear', 'easy');
    game.clickNode(1);
    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.phase).toBe('playing');
    expect(state.bear).not.toBeNull();
    expect(state.turn).toBe('hunters');
    expect(state.bearMoves).toBe(1);

    vi.useRealTimers();
  });

  it('espone hook di benchmark solo in modalita esplicita', () => {
    const regularGame = createGame();
    expect(regularGame.benchmark).toBeUndefined();

    const benchmarkGame = createGame({ enableBenchmarkTools: true });
    benchmarkGame.benchmark.setState({
      mode: 'hvc',
      computerSide: 'bear',
      difficulty: 'medium',
      round: 1,
      phase: 'playing',
      turn: 'bear',
      bear: 18,
      hunters: [1, 19, 20],
      bearMoves: 5
    });

    const before = benchmarkGame.getState();
    const moved = benchmarkGame.benchmark.runComputerTurnSync();
    const after = benchmarkGame.getState();

    expect(moved).toBe(true);
    expect(after.bear).not.toBe(before.bear);
    expect(after.bearMoves).toBe(6);
    expect(after.turn).toBe('hunters');
  });

  it('espone le tre difficolta disponibili', () => {
    const game = createGame();
    expect(game.difficulties).toEqual(['easy', 'medium', 'hard']);
  });
});

describe('summarizeMatch', () => {
  it('restituisce partita in corso con meno di due round', () => {
    const summary = summarizeMatch([{ round: 1, reason: 'draw' }]);
    expect(summary.winnerPlayer).toBeNull();
    expect(summary.message).toContain('Partita in corso');
  });

  it('determina il vincitore quando un solo giocatore immobilizza l orso', () => {
    const summary = summarizeMatch([
      {
        round: 1,
        reason: 'hunters-win',
        immobilizationMoves: 8,
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
    ]);

    expect(summary.isTie).toBe(false);
    expect(summary.winnerPlayer).toBe('player-2');
  });

  it('risolve lo spareggio in base alle mosse di immobilizzazione', () => {
    const summary = summarizeMatch([
      {
        round: 1,
        reason: 'hunters-win',
        immobilizationMoves: 14,
        bearPlayer: 'player-1',
        huntersPlayer: 'player-2'
      },
      {
        round: 2,
        reason: 'hunters-win',
        immobilizationMoves: 10,
        bearPlayer: 'player-2',
        huntersPlayer: 'player-1'
      }
    ]);

    expect(summary.isTie).toBe(false);
    expect(summary.winnerPlayer).toBe('player-1');
  });
});
