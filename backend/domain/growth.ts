export type Observation = { year: number; enplanements: number | null };

export function calculateGrowth(previous: Observation, current: Observation) {
  if (previous.enplanements === null || current.enplanements === null) return null;
  validateGrowthInputs(previous, current);
  if (previous.enplanements === 0) return null;
  const change = current.enplanements - previous.enplanements;
  return { change, growthPercent: change / previous.enplanements * 100 };
}

function validateGrowthInputs(previous: Observation, current: Observation) {
  if (!Number.isSafeInteger(previous.year) || current.year !== previous.year + 1) {
    throw new Error('Growth requires consecutive calendar years.');
  }
  if (![previous.enplanements, current.enplanements].every(n => n !== null && Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Enplanements must be nonnegative safe integers.');
  }
}
