import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGrowth } from '../domain/growth.ts';

test('calculates independently checked FAA growth for all three airports', () => {
  for (const [previous, current, expected] of [
    [37760834, 36497303, -3.35],
    [25078968, 26251850, 4.68],
    [21090721, 21021153, -0.33],
  ]) {
    const result = calculateGrowth({ year: 2024, enplanements: previous }, { year: 2025, enplanements: current });
    assert.equal(Number(result!.growthPercent.toFixed(2)), expected);
    assert.equal(result!.change, current - previous);
  }
});
test('missing counts and zero baseline yield unavailable growth, not invented values', () => {
  for (const [previous, current] of [[null, 100], [100, null], [0, 100]]) {
    assert.equal(calculateGrowth({ year: 2024, enplanements: previous }, { year: 2025, enplanements: current }), null);
  }
});
test('zero current count is a valid 100 percent decline', () => {
  assert.equal(calculateGrowth({ year: 2024, enplanements: 100 }, { year: 2025, enplanements: 0 })!.growthPercent, -100);
});
test('rejects invalid counts and nonconsecutive years', () => {
  for (const value of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => calculateGrowth({ year: 2024, enplanements: 100 }, { year: 2025, enplanements: value }));
  }
  assert.throws(() => calculateGrowth({ year: 2023, enplanements: 100 }, { year: 2025, enplanements: 110 }));
});
