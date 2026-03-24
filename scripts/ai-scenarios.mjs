import { createAiEngine, DIFFICULTY_POLICY_CONFIG } from '../web/game-ai-policy.js';
import { pathToFileURL } from 'node:url';
import { createHistoryTracker } from './ai-tools.mjs';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const SCENARIOS = [
  {
    id: 'hunter-fan-closure',
    side: 'hunters',
    state: () => ({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 16,
      hunters: [17, 18, 8]
    }),
    assert: (move) => move?.from === 8 && move?.to === 19
  },
  {
    id: 'bear-outer-ring-escape',
    side: 'bear',
    state: () => ({
      phase: 'playing',
      turn: 'bear',
      bearMoves: 5,
      bear: 5,
      hunters: [2, 17, 20]
    }),
    assert: (move) => move?.to === 6
  },
  {
    id: 'hunter-outer-ring-cutoff',
    side: 'hunters',
    state: () => ({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 5,
      bear: 5,
      hunters: [2, 17, 20]
    }),
    assert: (move) => move?.from === 20 && move?.to === 11
  },
  {
    id: 'center-pressure',
    side: 'hunters',
    state: () => ({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 8,
      bear: 18,
      hunters: [16, 17, 19]
    }),
    assert: (move) => move?.to === 20
  },
  {
    id: 'no-immediate-undo',
    side: 'hunters',
    state: () => ({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 6,
      bear: 18,
      hunters: [16, 19, 20]
    }),
    prime(history, state) {
      history.rememberPosition(state);
      history.rememberMove('hunters', { from: 17, to: 16 }, { bear: state.bear });
    },
    assert: (move) => !(move?.from === 16 && move?.to === 17)
  },
  {
    id: 'no-repeated-response-loop',
    side: 'hunters',
    state: () => ({
      phase: 'playing',
      turn: 'hunters',
      bearMoves: 8,
      bear: 18,
      hunters: [16, 17, 19]
    }),
    prime(history, state) {
      history.rememberPosition(state);
      history.rememberResponsePattern('hunters', state, {
        phase: 'playing',
        turn: 'bear',
        bearMoves: 8,
        bear: 18,
        hunters: [16, 19, 20]
      });
    },
    assert: (move) => !(move?.from === 17 && move?.to === 20)
  }
];

export function runAiScenarios(configs = DIFFICULTY_POLICY_CONFIG) {
  const rows = [];

  for (const scenario of SCENARIOS) {
    for (const difficulty of DIFFICULTIES) {
      const history = createHistoryTracker();
      const engine = createAiEngine({ history });
      const state = scenario.state();
      scenario.prime?.(history, state);

      const move =
        scenario.side === 'bear'
          ? engine.chooseBearMove(state, difficulty, configs[difficulty])
          : engine.chooseHunterMove(state, difficulty, configs[difficulty]);

      rows.push({
        scenario: scenario.id,
        difficulty,
        move,
        passed: scenario.assert(move, state)
      });
    }
  }

  return {
    rows,
    passed: rows.every((row) => row.passed)
  };
}

export function printAiScenarios(result) {
  console.log('AI scenarios');
  for (const row of result.rows) {
    const label = row.passed ? 'PASS' : 'FAIL';
    console.log(`${label} ${row.scenario} ${row.difficulty} -> ${JSON.stringify(row.move)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runAiScenarios();
  printAiScenarios(result);
}
