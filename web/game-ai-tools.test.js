import { describe, expect, it } from 'vitest';
import { DIFFICULTY_POLICY_CONFIG } from './game-ai-policy.js';
import { runAiScenarios } from '../scripts/ai-scenarios.mjs';
import { runAiBenchmark } from '../scripts/ai-tools.mjs';

function summarizeBenchmark(result) {
  return {
    openings: result.openings.length,
    probes: result.probes.length,
    levels: Object.fromEntries(
      Object.entries(result.levels).map(([difficulty, row]) => [
        difficulty,
        {
          rating: row.rating,
          optimal: row.optimalResultRate,
          probe: row.probeFirstMoveQuality,
          top: row.probeTopChoiceRate,
          loops: row.loopIncidents
        }
      ])
    )
  };
}

describe('AI tooling', () => {
  it('passa tutta la suite di scenari tattici', () => {
    const result = runAiScenarios(DIFFICULTY_POLICY_CONFIG);
    expect(result.passed).toBe(true);
  });

  it('produce benchmark ripetibile e monotono', () => {
    const first = summarizeBenchmark(runAiBenchmark(DIFFICULTY_POLICY_CONFIG));
    const second = summarizeBenchmark(runAiBenchmark(DIFFICULTY_POLICY_CONFIG));

    expect(first).toEqual(second);
    expect(first.levels.hard.rating).toBeGreaterThan(first.levels.medium.rating);
    expect(first.levels.medium.rating).toBeGreaterThan(first.levels.easy.rating);
    expect(first.levels.easy.loops).toBe(0);
    expect(first.levels.medium.loops).toBe(0);
    expect(first.levels.hard.loops).toBe(0);
  });
});
