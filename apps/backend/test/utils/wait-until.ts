export async function waitUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean
): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('The condition did not hold within 5 s');
}
