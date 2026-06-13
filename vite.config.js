import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		middlewareMode: false,
		middleware: [
			(req, res, next) => {
				// Set COOP/COEP headers for SharedArrayBuffer support (Web Worker synchronization)
				res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
				res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
				next();
			}
		]
	}
});
