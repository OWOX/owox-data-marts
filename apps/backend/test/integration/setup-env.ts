import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env first (base configuration)
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env') });

// Load root .env.tests with override — test values take priority over .env
config({ path: resolve(__dirname, '..', '..', '..', '..', '.env.tests'), override: true });
