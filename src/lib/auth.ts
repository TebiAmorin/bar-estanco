const COOKIE_NAME = 'admin_session';
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 horas

// ── Helpers criptográficos ──────────────────────────────────────────────────

async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Comparación en tiempo constante para prevenir timing attacks.
 * Nunca uses === para comparar tokens/signatures.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

// ── Creación de sesión ──────────────────────────────────────────────────────

export async function createSessionCookie(password: string): Promise<string> {
  const secret = import.meta.env.ADMIN_SECRET;
  if (!secret || secret === 'dev-secret-change-me') {
    throw new Error('ADMIN_SECRET no configurado correctamente en producción');
  }

  const expires = Date.now() + COOKIE_MAX_AGE * 1000;
  // El token NO embebe la contraseña — usa un hash de ella para no exponerla
  const passwordHash = await hmacSign(password, secret);
  const payload = `${passwordHash}:${expires}`;
  const sig = await hmacSign(payload, secret);
  const token = btoa(`${payload}:${sig}`);

  // Secure: solo HTTPS (Vercel siempre es HTTPS en producción)
  const isProduction = import.meta.env.PROD;
  const secureFlag = isProduction ? '; Secure' : '';

  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE}${secureFlag}`;
}

// ── Verificación de sesión ──────────────────────────────────────────────────

export async function verifySession(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;

  const secret = import.meta.env.ADMIN_SECRET;
  const adminPassword = import.meta.env.ADMIN_PASSWORD;

  // Sin variables configuradas, nunca conceder acceso
  if (!secret || !adminPassword) return false;
  if (secret === 'dev-secret-change-me') return false;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  try {
    const decoded = atob(match[1]);
    const parts = decoded.split(':');
    if (parts.length < 3) return false;

    const sig = parts.pop()!;
    const expires = parseInt(parts.pop()!, 10);
    const storedPasswordHash = parts.join(':');

    // Verificar expiración
    if (isNaN(expires) || Date.now() > expires) return false;

    // Verificar que el hash de la contraseña almacenada corresponde a la contraseña actual
    const expectedHash = await hmacSign(adminPassword, secret);
    if (!safeEqual(storedPasswordHash, expectedHash)) return false;

    // Verificar firma HMAC del token completo (integridad)
    const payload = `${storedPasswordHash}:${expires}`;
    const expectedSig = await hmacSign(payload, secret);
    return safeEqual(sig, expectedSig);
  } catch {
    return false;
  }
}

// ── Cierre de sesión ────────────────────────────────────────────────────────

export function clearSessionCookie(): string {
  const isProduction = import.meta.env.PROD;
  const secureFlag = isProduction ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`;
}
