import { Redis } from '@upstash/redis';
import cartaLocal from '../data/carta.json';
import horariosLocal from '../data/horarios.json';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = import.meta.env.UPSTASH_REDIS_REST_URL;
  const token = import.meta.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

export async function getCarta(): Promise<any> {
  const r = getRedis();
  if (!r) return cartaLocal;
  try {
    const data = await r.get('carta');
    return data || cartaLocal;
  } catch {
    return cartaLocal;
  }
}

export async function setCarta(data: any): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error('Redis not configured');
  await r.set('carta', data);
}

export async function getHorarios(): Promise<any> {
  const r = getRedis();
  if (!r) return horariosLocal;
  try {
    const data = await r.get('horarios');
    return data || horariosLocal;
  } catch {
    return horariosLocal;
  }
}

export async function setHorarios(data: any): Promise<void> {
  const r = getRedis();
  if (!r) throw new Error('Redis not configured');
  await r.set('horarios', data);
}

export async function initData(): Promise<{ carta: boolean; horarios: boolean }> {
  const r = getRedis();
  if (!r) throw new Error('Redis not configured');

  const existingCarta = await r.get('carta');
  const existingHorarios = await r.get('horarios');

  let cartaSeeded = false;
  let horariosSeeded = false;

  if (!existingCarta) {
    await r.set('carta', cartaLocal);
    cartaSeeded = true;
  }
  if (!existingHorarios) {
    await r.set('horarios', horariosLocal);
    horariosSeeded = true;
  }

  return { carta: cartaSeeded, horarios: horariosSeeded };
}
