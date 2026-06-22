export const prerender = false;

import type { APIRoute } from 'astro';
import { verifySession } from '../../lib/auth';
import { getCarta, setCarta } from '../../lib/kv';

// ── Validación de esquema ───────────────────────────────────────────────────

const MAX_STRING = 300;      // max longitud de cualquier campo de texto
const MAX_ITEMS = 500;       // max productos en toda la carta
const MAX_GROUPS = 50;       // max grupos por categoría
const MAX_PRICE_LEN = 10;    // max longitud de precio

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function sanitizeString(v: unknown, maxLen = MAX_STRING): string {
  if (!isString(v)) return '';
  // Eliminar caracteres de control y limitar longitud
  return v.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLen).trim();
}

function isValidPrice(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  const str = String(v).trim();
  if (!str) return true;
  return /^\d{1,6}([.,]\d{1,2})?$/.test(str);
}

function coercePrice(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v).trim().slice(0, MAX_PRICE_LEN);
}

function validateItem(item: unknown): { valid: boolean; sanitized?: object } {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { valid: false };
  }
  const i = item as Record<string, unknown>;

  // Nombre es obligatorio
  const nombre = sanitizeString(i.nombre);
  if (!nombre) return { valid: false };

  // Precio: formato numérico o vacío
  if (!isValidPrice(i.precio)) return { valid: false };
  if (!isValidPrice(i.precioCopa)) return { valid: false };

  return {
    valid: true,
    sanitized: {
      nombre,
      bodega: i.bodega ? sanitizeString(i.bodega) : null,
      tipo: i.tipo ? sanitizeString(i.tipo) : null,
      precio: coercePrice(i.precio),
      precioCopa: i.precioCopa != null && i.precioCopa !== '' ? coercePrice(i.precioCopa) : null,
      destacado: i.destacado === true,
      sugerencia: i.sugerencia === true,
      descripcion: i.descripcion ? sanitizeString(i.descripcion, 500) : null,
    },
  };
}

function validateGroup(group: unknown): { valid: boolean; sanitized?: object } {
  if (!group || typeof group !== 'object' || Array.isArray(group)) {
    return { valid: false };
  }
  const g = group as Record<string, unknown>;
  if (!Array.isArray(g.items)) return { valid: false };
  if (g.items.length > MAX_ITEMS) return { valid: false };

  const sanitizedItems: object[] = [];
  for (const item of g.items) {
    const result = validateItem(item);
    if (!result.valid || !result.sanitized) return { valid: false };
    sanitizedItems.push(result.sanitized);
  }

  return {
    valid: true,
    sanitized: {
      do: sanitizeString(g.do, 100),
      items: sanitizedItems,
    },
  };
}

function validateGroupArray(arr: unknown): { valid: boolean; sanitized?: object[] } {
  if (!Array.isArray(arr)) return { valid: false };
  if (arr.length > MAX_GROUPS) return { valid: false };

  const sanitized: object[] = [];
  for (const group of arr) {
    const result = validateGroup(group);
    if (!result.valid || !result.sanitized) return { valid: false };
    sanitized.push(result.sanitized);
  }
  return { valid: true, sanitized };
}

/**
 * Valida y sanitiza la estructura completa de la carta.
 * Rechaza cualquier dato que no cumpla el esquema esperado.
 */
function validateCarta(data: unknown): { valid: boolean; sanitized?: object; error?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, error: 'Formato de carta inválido' };
  }

  const d = data as Record<string, unknown>;

  // Validar sección vinos
  if (!d.vinos || typeof d.vinos !== 'object' || Array.isArray(d.vinos)) {
    return { valid: false, error: 'Sección vinos inválida' };
  }
  const vinos = d.vinos as Record<string, unknown>;

  const sections: Record<string, unknown> = {
    tintos: vinos.tintos,
    blancos: vinos.blancos,
    rosados: vinos.rosados,
    espumosos: vinos.espumosos,
    sinAlcohol: vinos.sinAlcohol,
  };

  const sanitizedVinos: Record<string, object[]> = {};
  for (const [key, val] of Object.entries(sections)) {
    const result = validateGroupArray(val);
    if (!result.valid || !result.sanitized) {
      return { valid: false, error: `Sección vinos.${key} inválida` };
    }
    sanitizedVinos[key] = result.sanitized;
  }

  // Otras categorías
  const categories = ['vermuts', 'tapas', 'conservas', 'desayunos', 'copa'] as const;
  const sanitizedCategories: Record<string, object[]> = {};

  for (const cat of categories) {
    const val = d[cat];
    // copa es opcional (puede que el KV antiguo no la tenga)
    if (cat === 'copa' && (val === undefined || val === null)) {
      sanitizedCategories[cat] = [];
      continue;
    }
    const result = validateGroupArray(val);
    if (!result.valid || !result.sanitized) {
      return { valid: false, error: `Sección ${cat} inválida` };
    }
    sanitizedCategories[cat] = result.sanitized;
  }

  return {
    valid: true,
    sanitized: {
      vinos: sanitizedVinos,
      ...sanitizedCategories,
    },
  };
}

// ── Rate limiting simple en memoria ─────────────────────────────────────────
// (Vercel serverless: cada instancia tiene su propio contador, pero es suficiente
//  para frenar floods básicos. Para algo más robusto usar Upstash Ratelimit)
const writeAttempts = new Map<string, { count: number; resetAt: number }>();

function checkWriteLimit(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minuto
  const maxWrites = 30;  // 30 guardados por minuto por IP

  const entry = writeAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    writeAttempts.set(ip, { count: 1, resetAt: now + window });
    return true;
  }
  if (entry.count >= maxWrites) return false;
  entry.count++;
  return true;
}

// ── API Routes ───────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const valid = await verifySession(cookie);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const carta = await getCarta();
  return new Response(JSON.stringify(carta), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};

export const PUT: APIRoute = async ({ request, clientAddress }) => {
  // 1. Autenticación
  const cookie = request.headers.get('cookie');
  const valid = await verifySession(cookie);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Rate limiting
  const ip = clientAddress || 'unknown';
  if (!checkWriteLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes. Espera un momento.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // 3. Tamaño máximo del payload (protección contra payloads gigantes)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 500_000) { // 500KB max
    return new Response(JSON.stringify({ error: 'Payload demasiado grande' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Parseo seguro
  let rawData: unknown;
  try {
    rawData = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Validación y sanitización del esquema
  const validation = validateCarta(rawData);
  if (!validation.valid || !validation.sanitized) {
    return new Response(JSON.stringify({ error: validation.error || 'Datos inválidos' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 6. Guardar solo los datos sanitizados
  try {
    await setCarta(validation.sanitized);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Error al guardar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
