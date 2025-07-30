import { bootstrap } from './bootstrap';
import express from 'express';

// Keep original main.ts functionality for standalone execution
export async function main() {
  try {
    await bootstrap({ express: express() });
  } catch {
    process.exit(1);
  }
}

void main();
