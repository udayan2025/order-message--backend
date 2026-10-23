export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function calculateRandomDelay(minSeconds: number, maxSeconds: number): number {
  const min = Math.max(1, minSeconds);
  const max = Math.max(min, maxSeconds);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
