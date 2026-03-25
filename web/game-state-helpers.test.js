import { describe, expect, it } from 'vitest';
import {
  adjacency,
  applyVirtualMoveToState,
  canonicalHuntersKey,
  getBearLegalMovesForState,
  getHunterLegalMovesForState,
  graphDistance,
  isCentralZoneNode,
  isGatewayNode,
  isInnerRingNode,
  isOccupiedNode,
  isOuterRingNode,
  nodeDistance,
  reachableCountForState,
  sortHunters,
  validBearStartPositionsForHunters
} from './game-state-helpers.js';

describe('game-state-helpers', () => {
  it('ordina e canonizza i cacciatori', () => {
    expect(sortHunters([9, 1, 5])).toEqual([1, 5, 9]);
    expect(canonicalHuntersKey([9, 1, 5])).toBe('1,5,9');
  });

  it('riconosce occupazione e mosse legali dell orso anche con stato invalido', () => {
    const state = {
      hunters: [1, 2, 3],
      bear: 5
    };

    expect(isOccupiedNode(state, 2)).toBe(true);
    expect(isOccupiedNode(state, 5)).toBe(true);
    expect(isOccupiedNode(state, 4)).toBe(false);
    expect(getBearLegalMovesForState({ ...state, bear: null })).toEqual([]);
    expect(getBearLegalMovesForState(state)).toEqual([4, 6, 14, 17]);
  });

  it('calcola le mosse legali dei cacciatori saltando posizioni invalide e celle occupate', () => {
    const state = {
      hunters: [1, null, 8],
      bear: 2
    };

    expect(getHunterLegalMovesForState(state)).toEqual([
      { hunterIndex: 0, from: 1, to: 4 },
      { hunterIndex: 0, from: 1, to: 0 },
      { hunterIndex: 1, from: null, to: undefined },
      { hunterIndex: 2, from: 8, to: 7 },
      { hunterIndex: 2, from: 8, to: 9 },
      { hunterIndex: 2, from: 8, to: 19 },
      { hunterIndex: 2, from: 8, to: 15 }
    ].filter((move) => Number.isInteger(move.from)));
  });

  it('applica correttamente le mosse virtuali di orso e cacciatori', () => {
    const state = {
      phase: 'playing',
      turn: 'bear',
      bearMoves: 6,
      hunters: [1, 2, 3],
      bear: 5
    };

    expect(applyVirtualMoveToState(state, 'bear', { to: 4 })).toEqual({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 7,
      hunters: [1, 2, 3],
      bear: 4
    });
    expect(applyVirtualMoveToState({ ...state, turn: 'hunters' }, 'hunters', {
      hunterIndex: 1,
      from: 2,
      to: 16
    })).toEqual({
      phase: 'playing',
      turn: 'bear',
      bearMoves: 6,
      hunters: [1, 16, 3],
      bear: 5
    });
  });

  it('espone distanze geometriche e di grafo con fallback safe', () => {
    expect(nodeDistance(0, 3)).toBeGreaterThan(0);
    expect(nodeDistance(0, 999)).toBe(0);
    expect(graphDistance(0, 3)).toBe(1);
    expect(graphDistance(0, 999)).toBe(0);
    expect(graphDistance(null, 3)).toBe(0);
  });

  it('conta i nodi raggiungibili con profondita e start invalidi', () => {
    const state = {
      hunters: [1, 2, 3],
      bear: 5
    };

    expect(reachableCountForState(state, null, 3)).toBe(0);
    expect(reachableCountForState(state, 5, 0)).toBe(1);
    expect(reachableCountForState(state, 5, 1)).toBe(5);
  });

  it('classifica correttamente i nodi speciali e gli start validi dell orso', () => {
    expect(isCentralZoneNode(18)).toBe(true);
    expect(isCentralZoneNode(0)).toBe(false);
    expect(isInnerRingNode(16)).toBe(true);
    expect(isInnerRingNode(5)).toBe(false);
    expect(isOuterRingNode(15)).toBe(true);
    expect(isOuterRingNode(18)).toBe(false);
    expect(isGatewayNode(2)).toBe(true);
    expect(isGatewayNode(3)).toBe(false);

    const starts = validBearStartPositionsForHunters([3, 1, 2]);
    expect(starts).not.toContain(0);
    expect(starts).not.toContain(1);
    expect(starts).toContain(5);
    expect(starts).toContain(11);
  });

  it('espone la topologia attesa del grafo di gioco', () => {
    expect(adjacency.get(0)).toEqual([3, 1, 2]);
    expect(adjacency.get(18)).toEqual([16, 20, 17, 19]);
  });
});
