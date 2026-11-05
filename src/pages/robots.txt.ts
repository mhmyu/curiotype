import type { APIRoute } from 'astro';
import { buildRobotsTxt } from '@/lib/seo';

// Generated instead of a static file in `public/`, because the sitemap line needs the
// public origin (`SITE_URL`), which is only known at build time.
export const GET: APIRoute = ({ site }) =>
  new Response(buildRobotsTxt(site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
