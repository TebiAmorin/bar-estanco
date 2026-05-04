export const prerender = false;

import type { APIRoute } from 'astro';
import { verifySession } from '../../lib/auth';
import { initData } from '../../lib/kv';

export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie');
  const valid = await verifySession(cookie);
  if (!valid) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  try {
    const result = await initData();
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Datos inicializados',
        seeded: result,
      })
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
