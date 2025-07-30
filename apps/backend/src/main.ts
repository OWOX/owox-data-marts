import { bootstrap } from './bootstrap';
import express from 'express';

/**
 * Main function to bootstrap the application in standalone mode.
 */
export async function main() {
  try {
    await bootstrap({ express: express() });
  } catch {
    process.exit(1);
  }
}

void main();
