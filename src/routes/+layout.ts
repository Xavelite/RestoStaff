// restogogo is an auth-gated internal dashboard, so it renders as a client-side
// SPA: no server-side rendering or prerendering. This keeps Supabase auth simple
// (a browser session) and mirrors how the product actually runs.
export const ssr = false;
export const prerender = false;
