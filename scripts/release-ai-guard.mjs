import { runMediumHardBenchmark } from './benchmark-medium-hard.mjs';

const THRESHOLDS = {
  minMediumQuality: 7.5,
  minHardQuality: 6.5,
  maxQualityGap: 1.5,
  maxMediumTimeMs: 10,
  maxHardTimeMs: 350
};

const metrics = normalizeBenchmark(runMediumHardBenchmark().summary);
validateBenchmark(metrics);

console.log(
  `AI guard passed: medium=${metrics.mediumQuality}/10, hard=${metrics.hardQuality}/10, medium=${metrics.mediumTimeMs}ms, hard=${metrics.hardTimeMs}ms`
);

function normalizeBenchmark(summary) {
  return {
    mediumQuality: Number(summary.mediumScore),
    hardQuality: Number(summary.hardScore),
    mediumTimeMs: Number(summary.mediumTime),
    hardTimeMs: Number(summary.hardTime)
  };
}

function validateBenchmark(metrics) {
  const failures = [];

  if (metrics.mediumQuality < THRESHOLDS.minMediumQuality) {
    failures.push(`medium quality ${metrics.mediumQuality} < ${THRESHOLDS.minMediumQuality}`);
  }
  if (metrics.hardQuality < THRESHOLDS.minHardQuality) {
    failures.push(`hard quality ${metrics.hardQuality} < ${THRESHOLDS.minHardQuality}`);
  }
  if (metrics.mediumQuality - metrics.hardQuality > THRESHOLDS.maxQualityGap) {
    failures.push(
      `quality gap too large: medium-hard = ${(metrics.mediumQuality - metrics.hardQuality).toFixed(2)} > ${THRESHOLDS.maxQualityGap}`
    );
  }
  if (metrics.mediumTimeMs > THRESHOLDS.maxMediumTimeMs) {
    failures.push(`medium time ${metrics.mediumTimeMs}ms > ${THRESHOLDS.maxMediumTimeMs}ms`);
  }
  if (metrics.hardTimeMs > THRESHOLDS.maxHardTimeMs) {
    failures.push(`hard time ${metrics.hardTimeMs}ms > ${THRESHOLDS.maxHardTimeMs}ms`);
  }

  if (failures.length > 0) {
    throw new Error(`AI release guard failed:\n- ${failures.join('\n- ')}`);
  }
}
