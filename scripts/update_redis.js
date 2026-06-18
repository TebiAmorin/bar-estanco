import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envContent = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/^"|"$/g, '');
  }
});

const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const cartaLocal = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/carta.json'), 'utf8'));

async function update() {
  await redis.set('carta', cartaLocal);
  console.log('Redis carta updated successfully');
}
update();
