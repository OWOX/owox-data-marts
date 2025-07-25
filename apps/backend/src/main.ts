import { bootstrap } from './bootstrap';

// Keep original main.ts functionality for standalone execution
export async function main() {
  try {
    await bootstrap();
  } catch {
    process.exit(1);
  }
}

void main();
