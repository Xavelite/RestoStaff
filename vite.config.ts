import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Adapter and compiler options live in svelte.config.js, the place SvelteKit
// and Vercel both look for them.
export default defineConfig({
	plugins: [sveltekit()]
});
