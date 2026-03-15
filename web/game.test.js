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
  function movedHunterIndex(before, after) {
    for (let i = 0; i < before.hunters.length; i += 1) {
      if (before.hunters[i] !== after.hunters[i]) return i;
    }
    return null;
  }

  function pickBearMove(state, preferred, game) {
    const legalMoves = game.adjacency.get(state.bear).filter((to) => !state.hunters.includes(to));
    if (legalMoves.includes(preferred)) return preferred;
    return legalMoves[0] ?? null;
  }

  function movedHunterStep(before, after) {
    for (let i = 0; i < before.hunters.length; i += 1) {
      if (before.hunters[i] !== after.hunters[i]) {
        return { hunterIndex: i, from: before.hunters[i], to: after.hunters[i] };
      }
    }
    return null;
  }

  function boardSignature(state) {
    return `${state.turn}|${state.bear}|${[...state.hunters].sort((a, b) => a - b).join(',')}`;
  }

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

  it('getState restituisce uno snapshot e non espone mutabilita interna', () => {
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

  it('i cacciatori scelgono una lunetta iniziale prima del setup orso', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(8);

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters).toEqual([7, 8, 9]);
  });

  it('in setup cacciatori ignora nodi fuori lunetta', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(18);

    const state = game.getState();
    expect(state.phase).toBe('setup-hunters');
    expect(state.hunters).toEqual([]);
  });

  it('non permette all orso di partire su una posizione occupata', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);

    game.clickNode(1);
    expect(game.getState().bear).toBeNull();

    game.clickNode(18);
    expect(game.getState().bear).toBe(18);
    expect(game.getState().phase).toBe('playing');
  });

  it('non permette all orso di partire su una posizione senza mosse legali', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);

    game.clickNode(0);

    const state = game.getState();
    expect(state.bear).toBeNull();
    expect(state.phase).toBe('setup-bear');
    expect(state.message).toContain('Posizione iniziale non valida');
  });

  it('in setup automatico l IA orso sceglie sempre una partenza con almeno una mossa legale', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'bear', 'easy');
    game.clickNode(1);

    vi.runOnlyPendingTimers();
    const state = game.getState();
    expect(state.phase).toBe('playing');
    expect(state.bear).not.toBeNull();
    expect(game.adjacency.get(state.bear).some((to) => !state.hunters.includes(to))).toBe(true);

    vi.useRealTimers();
  });

  it('applica una mossa valida dell orso e una dei cacciatori', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
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
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);
    game.clickNode(18);

    game.clickNode(0);
    const state = game.getState();
    expect(state.bear).toBe(18);
    expect(state.turn).toBe('bear');
    expect(state.bearMoves).toBe(0);
  });

  it('ignora input nodo non valido senza alterare lo stato', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    const before = game.getState();

    game.clickNode(-1);
    game.clickNode(999);

    const after = game.getState();
    expect(after).toEqual(before);
  });

  it('mantiene selezione cacciatore se la destinazione non e valida', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);
    game.clickNode(18);
    game.clickNode(16);

    game.clickNode(1);
    game.clickNode(14);

    const state = game.getState();
    expect(state.selectedHunter).toBe(0);
    expect(state.hunters).toEqual([1, 2, 3]);
    expect(state.turn).toBe('hunters');
    expect(state.message).toContain('Mossa non valida');
  });

  it('mostra una guida esplicita se i cacciatori cliccano una destinazione senza selezione', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');
    game.clickNode(1);
    game.clickNode(18);
    game.clickNode(16);

    game.clickNode(14);

    const state = game.getState();
    expect(state.selectedHunter).toBeNull();
    expect(state.turn).toBe('hunters');
    expect(state.message).toContain('seleziona un cacciatore');
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
    expect(state.roundResults[0].huntersPlayer).toBe('player-2');
    expect(state.lastRoundResult?.round).toBe(1);
    expect(state.message).toContain('devono scegliere una lunetta iniziale');
    expect(state.turn).toBe('hunters');
  });

  it('dopo due round patta entra in tie-after-two-rounds', () => {
    const game = createGame();
    game.newMatch('hvh', 'bear', 'easy');

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

  it('in hvc con IA cacciatori seleziona automaticamente una lunetta', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters', 'easy');

    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters.length).toBe(3);
    expect(state.bear).toBeNull();

    vi.useRealTimers();
  });

  it('in hvc hard usa un fast path per la prima lunetta su tavoliere vuoto', () => {
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
      mode: 'hvc',
      computerSide: 'hunters',
      difficulty: 'hard',
      round: 1,
      phase: 'setup-hunters',
      turn: 'hunters',
      hunters: [],
      bear: null,
      bearMoves: 0
    });

    const moved = game.benchmark.runComputerTurnSync();
    const state = game.getState();

    expect(moved).toBe(true);
    expect(state.phase).toBe('setup-bear');
    expect(state.hunters).toEqual([1, 2, 3]);
  });

  it('in setup cacciatori con IA ignora click umano prima del timer', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters', 'easy');

    game.clickNode(1);
    expect(game.getState().hunters).toEqual([]);

    vi.runOnlyPendingTimers();
    expect(game.getState().hunters.length).toBe(3);

    vi.useRealTimers();
  });

  it('ignora timer pendenti della partita precedente quando parte una nuova partita', () => {
    vi.useFakeTimers();
    const game = createGame();

    game.newMatch('hvc', 'hunters', 'easy');
    game.newMatch('hvh', 'bear', 'easy');

    vi.runOnlyPendingTimers();

    const state = game.getState();
    expect(state.mode).toBe('hvh');
    expect(state.phase).toBe('setup-hunters');
    expect(state.hunters).toEqual([]);

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

  it('setConfig aggiorna configurazione e fallback difficolta con callback onChange', () => {
    const game = createGame();
    const onChange = vi.fn();
    game.setOnChange(onChange);

    game.setConfig('hvc', 'hunters', 'hard');
    expect(game.getState().mode).toBe('hvc');
    expect(game.getState().computerSide).toBe('hunters');
    expect(game.getState().difficulty).toBe('hard');
    expect(onChange).toHaveBeenCalledTimes(1);

    game.setConfig('hvc', 'bear', 'unknown');
    expect(game.getState().difficulty).toBe('easy');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('in hvc medium con IA cacciatori usa la logica minimax su setup e mossa', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters', 'medium');

    // setup cacciatori automatico (medium)
    vi.runOnlyPendingTimers();
    expect(game.getState().phase).toBe('setup-bear');
    expect(game.getState().hunters.length).toBe(3);

    // setup orso umano, poi mossa orso umana per innescare risposta cacciatori IA
    game.clickNode(18);
    expect(game.getState().turn).toBe('bear');
    game.clickNode(16);
    expect(game.getState().turn).toBe('hunters');

    vi.runOnlyPendingTimers();
    const state = game.getState();
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe('bear');

    vi.useRealTimers();
  });

  it('in hvc medium i cacciatori non restano bloccati a muovere sempre lo stesso pezzo in loop corto', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters', 'medium');

    vi.runOnlyPendingTimers();
    game.clickNode(18);

    const movedHunters = [];
    const preferredPath = [16, 18, 16, 18, 16, 18];

    for (const preferred of preferredPath) {
      const beforeBearMove = game.getState();
      if (beforeBearMove.phase !== 'playing' || beforeBearMove.turn !== 'bear') break;

      const target = pickBearMove(beforeBearMove, preferred, game);
      if (target === null) break;

      game.clickNode(target);
      const beforeReply = game.getState();
      if (beforeReply.phase !== 'playing') break;
      expect(beforeReply.turn).toBe('hunters');

      vi.runOnlyPendingTimers();
      const afterReply = game.getState();
      if (afterReply.phase !== 'playing') break;
      movedHunters.push(movedHunterIndex(beforeReply, afterReply));
      expect(afterReply.turn).toBe('bear');
    }

    expect(movedHunters.length).toBeGreaterThan(1);
    expect(new Set(movedHunters).size).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('in hvc medium i cacciatori evitano di annullare subito la propria ultima mossa se hanno alternative', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'hunters', 'medium');

    vi.runOnlyPendingTimers();
    game.clickNode(18);

    let previousHunterMove = null;
    const preferredPath = [16, 18, 16, 18, 16, 18];

    for (const preferred of preferredPath) {
      const beforeBearMove = game.getState();
      if (beforeBearMove.phase !== 'playing' || beforeBearMove.turn !== 'bear') break;

      const target = pickBearMove(beforeBearMove, preferred, game);
      if (target === null) break;

      game.clickNode(target);
      const beforeReply = game.getState();
      if (beforeReply.phase !== 'playing' || beforeReply.turn !== 'hunters') break;

      vi.runOnlyPendingTimers();
      const afterReply = game.getState();
      if (afterReply.phase !== 'playing') break;

      const currentHunterMove = movedHunterStep(beforeReply, afterReply);
      expect(currentHunterMove).not.toBeNull();

      if (previousHunterMove) {
        const isImmediateUndo =
          currentHunterMove.hunterIndex === previousHunterMove.hunterIndex &&
          currentHunterMove.from === previousHunterMove.to &&
          currentHunterMove.to === previousHunterMove.from;
        expect(isImmediateUndo).toBe(false);
      }

      previousHunterMove = currentHunterMove;
    }

    vi.useRealTimers();
  });

  it('in hvc hard i cacciatori evitano di oscillare tra le stesse due formazioni', () => {
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
      mode: 'hvc',
      computerSide: 'hunters',
      difficulty: 'hard',
      round: 1,
      phase: 'playing',
      turn: 'bear',
      bear: 18,
      hunters: [1, 19, 20],
      bearMoves: 1
    });

    const hunterLayouts = [];
    const preferredPath = [17, 18, 17, 18, 17, 18];

    for (const preferred of preferredPath) {
      const beforeBearMove = game.getState();
      if (beforeBearMove.phase !== 'playing' || beforeBearMove.turn !== 'bear') break;

      const target = pickBearMove(beforeBearMove, preferred, game);
      if (target === null) break;

      game.clickNode(target);
      const beforeReply = game.getState();
      if (beforeReply.phase !== 'playing' || beforeReply.turn !== 'hunters') break;

      game.benchmark.runComputerTurnSync();
      const afterReply = game.getState();
      if (afterReply.phase !== 'playing') break;
      hunterLayouts.push([...afterReply.hunters].sort((a, b) => a - b).join(','));
    }

    expect(hunterLayouts.length).toBeGreaterThan(3);
    expect(new Set(hunterLayouts).size).toBeGreaterThan(2);
  });

  it('in hvc hard i cacciatori evitano di ripetere la stessa risposta quando l orso ricrea lo stesso stato', () => {
    vi.useFakeTimers();
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
      mode: 'hvc',
      computerSide: 'hunters',
      difficulty: 'hard',
      round: 1,
      phase: 'playing',
      turn: 'bear',
      bear: 18,
      hunters: [16, 17, 19],
      bearMoves: 8
    });

    const responsesByBeforeState = new Map();
    const preferredPath = [20, 18, 20, 18, 20, 18];

    for (const preferred of preferredPath) {
      const beforeBearMove = game.getState();
      if (beforeBearMove.phase !== 'playing' || beforeBearMove.turn !== 'bear') break;

      const target = pickBearMove(beforeBearMove, preferred, game);
      if (target === null) break;

      game.clickNode(target);
      const beforeReply = game.getState();
      if (beforeReply.phase !== 'playing' || beforeReply.turn !== 'hunters') break;

      const beforeKey = boardSignature(beforeReply);
      vi.runOnlyPendingTimers();
      const afterReply = game.getState();
      if (afterReply.phase !== 'playing') break;

      const afterKey = boardSignature(afterReply);
      const responses = responsesByBeforeState.get(beforeKey) ?? [];
      responses.push(afterKey);
      responsesByBeforeState.set(beforeKey, responses);
    }

    const repeatedStates = [...responsesByBeforeState.values()].filter((responses) => responses.length > 1);
    for (const responses of repeatedStates) {
      expect(new Set(responses).size).toBeGreaterThan(1);
    }

    vi.useRealTimers();
  });

  it('in hvc hard con orso al centro i cacciatori aumentano il controllo dell anello interno', () => {
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
      mode: 'hvc',
      computerSide: 'hunters',
      difficulty: 'hard',
      round: 1,
      phase: 'playing',
      turn: 'hunters',
      bear: 18,
      hunters: [16, 17, 19],
      bearMoves: 8
    });

    game.benchmark.runComputerTurnSync();
    const after = game.getState();
    const innerRingNodes = [16, 17, 19, 20];

    expect(after.turn).toBe('bear');
    expect(after.hunters.filter((nodeId) => innerRingNodes.includes(nodeId))).toHaveLength(3);
  });

  it('in hvc hard chiude un accesso diretto al centro quando puo costringere l orso a uscire', () => {
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
      mode: 'hvc',
      computerSide: 'hunters',
      difficulty: 'hard',
      round: 1,
      phase: 'playing',
      turn: 'hunters',
      bear: 16,
      hunters: [17, 18, 8],
      bearMoves: 6
    });

    game.benchmark.runComputerTurnSync();
    const after = game.getState();

    expect(after.turn).toBe('bear');
    expect(after.hunters).toContain(19);
    expect(after.hunters).not.toContain(8);
  });

  it('in hvc hard con IA orso usa setup e mossa avanzata', () => {
    vi.useFakeTimers();
    const game = createGame();
    game.newMatch('hvc', 'bear', 'medium');
    game.clickNode(1);

    vi.runOnlyPendingTimers();
    const state = game.getState();
    expect(state.phase).toBe('playing');
    expect(state.bear).not.toBeNull();
    expect(state.turn).toBe('hunters');
    expect(state.bearMoves).toBe(1);

    vi.useRealTimers();
  });

  it('espone le tre difficolta disponibili', () => {
    const game = createGame();
    expect(game.difficulties).toEqual(['easy', 'medium', 'hard']);
  });

  it('non espone hook di benchmark di default', () => {
    const game = createGame();
    expect(game.benchmark).toBeUndefined();
  });

  it('espone hook sincroni per benchmark solo in modalita esplicita', () => {
    const game = createGame({ enableBenchmarkTools: true });
    game.benchmark.setState({
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

    const before = game.getState();
    const moved = game.benchmark.runComputerTurnSync();
    const after = game.getState();

    expect(moved).toBe(true);
    expect(after.bear).not.toBe(before.bear);
    expect(after.bearMoves).toBe(6);
    expect(after.turn).toBe('hunters');
  });
});

describe('summarizeMatch', () => {
  it('restituisce partita in corso con meno di due round', () => {
    const summary = summarizeMatch([{ round: 1, reason: 'draw' }]);
    expect(summary.winnerPlayer).toBeNull();
    expect(summary.message).toContain('Partita in corso');
  });

  it('determina vittoria player-2 quando solo lui immobilizza l orso', () => {
    const summary = summarizeMatch([
      {
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

  it('risolve spareggio con entrambi i giocatori vincenti in base alle mosse', () => {
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

  it('restituisce parita se entrambi immobilizzano in uguale numero di mosse', () => {
    const summary = summarizeMatch([
      {
        round: 1,
        reason: 'hunters-win',
        immobilizationMoves: 12,
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
    ]);

    expect(summary.isTie).toBe(true);
    expect(summary.winnerPlayer).toBeNull();
  });
});
