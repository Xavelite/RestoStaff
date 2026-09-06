import staticAdapter from '@sveltejs/adapter-static';
import vercelAdapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Vercel is the deploy target, so every real build — the platform itself and
// Linux CI — uses adapter-vercel. That adapter writes its function aliases as
// symlinks, which need Windows Developer Mode, so a local Windows build falls
// back to the static SPA output rather than failing outright. Vercel sets
// VERCEL=1, which is what keeps a deployed build on the real adapter.
const adapter =
	process.platform === 'win32' && process.env.VERCEL !== '1'
		? staticAdapter({ fallback: 'index.html' })
		: vercelAdapter();

// The development Vercel project shares xbesnard.com with a small public
// homepage. Local development intentionally stays at `/` so existing commands,
// tests and browser workflows do not change.
const base = process.env.RESTOGOGO_BASE_PATH ?? (process.env.VERCEL === '1' ? '/restogogo' : '');

export default {
	preprocess: vitePreprocess(),

	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed
		// in Svelte 6.
		runes: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},

	kit: {
		adapter,
		paths: { base }
	}
};
