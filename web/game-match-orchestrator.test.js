import { describe, expect, it } from 'vitest';
import { controllerFor } from './game-match-orchestrator.js';

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
