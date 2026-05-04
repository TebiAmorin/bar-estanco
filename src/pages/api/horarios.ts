export const prerender = false;

import type { APIRoute } from 'astro';
import { verifySession } from '../../lib/auth';
import { getHorarios, setHorarios } from '../../lib/kv';

// ── Validación de esquema ───────────────────────────────────────────────────

const MAX_STRING = 100;      // max longitud del nombre del día
const MAX_DAYS = 14;         // max número de días/bloques
const MAX_TURNOS = 5;        // max turnos por día

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function sanitizeString(v: unknown, maxLen = MAX_STRING): string {
  if (!isString(v)) return '';
  // Eliminar caracteres de control y limitar longitud
  return v.replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLen).trim();
}

function isValidTime(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true; // opcional/vacío
  if (!isString(v)) return false;
  // Validar formato HH:MM
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v.trim());
}

function validateTurno(turno: unknown): { valid: boolean; sanitized?: [string, string] } {
  if (!Array.isArray(turno) || turno.length !== 2) return { valid: false };
  const [apertura, cierre] = turno;
  
  if (!isValidTime(apertura) || !isValidTime(cierre)) return { valid: false };
  
  return {
    valid: true,
    sanitized: [
      isString(apertura) ? apertura.trim() : '',
      isString(cierre) ? cierre.trim() : ''
    ]
  };
}

function validateHorarios(data: unknown): { valid: boolean; sanitized?: object[]; error?: string } {
  if (!Array.isArray(data)) {
    return { valid: false, error: 'Formato de horarios inválido (debe ser un array)' };
  }
  
  if (data.length > MAX_DAYS) {
    return { valid: false, error: `Demasiados días configurados (max ${MAX_DAYS})` };
  }

  const sanitizedDays: object[] = [];

  for (const day of data) {
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      return { valid: false, error: 'Formato de día inválido' };
    }
    const d = day as Record<string, unknown>;
    
    const diaName = sanitizeString(d.dia);
    if (!diaName) return { valid: false, error: 'El nombre del día es obligatorio' };

    if (!Array.isArray(d.turnos) || d.turnos.length > MAX_TURNOS) {
      return { valid: false, error: `Turnos inválidos o demasiados turnos (max ${MAX_TURNOS} por día)` };
    }

    const sanitizedTurnos: [string, string][] = [];
    for (const t of d.turnos) {
      const result = validateTurno(t);
      if (!result.valid || !result.sanitized) {
        return { valid: false, error: 'Formato de hora inválido en turno' };
      }
      sanitizedTurnos.push(result.sanitized);
    }

    sanitizedDays.push({
      dia: diaName,
      turnos: sanitizedTurnos
    });
  }

  return { valid: true, sanitized: sanitizedDays };
}

// ── Rate limiting simple en memoria ─────────────────────────────────────────

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

  const horarios = await getHorarios();
  return new Response(JSON.stringify(horarios), {
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

  // 3. Tamaño máximo del payload (100KB max para horarios es de sobra)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 100_000) {
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
  const validation = validateHorarios(rawData);
  if (!validation.valid || !validation.sanitized) {
    return new Response(JSON.stringify({ error: validation.error || 'Datos inválidos' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 6. Guardar solo los datos sanitizados
  try {
    await setHorarios(validation.sanitized);
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
