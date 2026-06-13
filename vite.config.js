import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
	plugins: [
		{
			name: 'add-headers',
			configureServer(server) {
				return () => {
					server.middlewares.use((req, res, next) => {
						// Set COOP/COEP headers for SharedArrayBuffer support (Web Worker synchronization)
						res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
						res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
						next();
					});
				};
			}
		},
		sveltekit()
	]
});
