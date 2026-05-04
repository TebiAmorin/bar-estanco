export const prerender = false;

import type { APIRoute } from 'astro';
import { createSessionCookie, clearSessionCookie, verifySession } from '../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // Logout
  if (body.action === 'logout') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Set-Cookie': clearSessionCookie() },
    });
  }

  // Login
  const { password } = body;
  const adminPassword = import.meta.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return new Response(JSON.stringify({ error: 'Admin not configured' }), { status: 500 });
  }

  if (password !== adminPassword) {
    return new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 401 });
  }

  const cookie = await createSessionCookie(password);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Set-Cookie': cookie },
  });
};

export const GET: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const valid = await verifySession(cookie);
  return new Response(JSON.stringify({ authenticated: valid }));
};
