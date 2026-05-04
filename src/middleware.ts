import { defineMiddleware } from 'astro:middleware';
import { verifySession } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin/* routes (except the login page itself and API)
  if (pathname.startsWith('/admin') && pathname !== '/admin' && pathname !== '/admin/') {
    const cookie = context.request.headers.get('cookie');
    const isValid = await verifySession(cookie);
    if (!isValid) {
      return context.redirect('/admin');
    }
  }

  return next();
});
