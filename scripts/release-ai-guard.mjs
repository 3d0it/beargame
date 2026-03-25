import { checkAiTableModule } from './ai-generate.mjs';
import { runAiScenarios } from './ai-scenarios.mjs';
import {
  configMatchesCurrent,
  runAiBenchmark,
  runAiReport,
  TARGET_RATINGS
} from './ai-tools.mjs';

const failures = [];

if (!(await checkAiTableModule())) {
  failures.push('generated AI table is out of date');
}

const scenarios = runAiScenarios();
if (!scenarios.passed) {
  failures.push('one or more tactical AI scenarios failed');
}

const benchmark = runAiBenchmark();
const report = runAiReport();

validateRatings(benchmark, failures);

if (!benchmark.orderingOkay) {
  failures.push('difficulty ordering is broken (hard >= medium >= easy)');
}

for (const difficulty of ['easy', 'medium', 'hard']) {
  if (benchmark.levels[difficulty].loopIncidents !== 0) {
    failures.push(`${difficulty} has avoidable loop incidents: ${benchmark.levels[difficulty].loopIncidents}`);
  }
}

if (!configMatchesCurrent(report.bestCandidate)) {
  failures.push('checked-in difficulty config does not match the current best calibration candidate');
}

if (failures.length > 0) {
  throw new Error(`AI release guard failed:\n- ${failures.join('\n- ')}`);
}

console.log(
  `AI guard passed: easy=${benchmark.levels.easy.rating}/10, medium=${benchmark.levels.medium.rating}/10, hard=${benchmark.levels.hard.rating}/10`
);

function validateRatings(benchmarkResult, failuresList) {
  const tolerances = {
    easy: 0.5,
    medium: 0.5,
    hard: 0.25
  };

  for (const difficulty of ['easy', 'medium', 'hard']) {
    const rating = benchmarkResult.levels[difficulty].rating;
    const target = TARGET_RATINGS[difficulty];
    if (Math.abs(rating - target) > tolerances[difficulty]) {
      failuresList.push(
        `${difficulty} rating ${rating} is outside target ${target} +/- ${tolerances[difficulty]}`
      );
    }
  }
}
