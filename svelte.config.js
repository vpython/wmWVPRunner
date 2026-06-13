import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter()
	},

	// IMPORTANT: Web Worker implementation requires SharedArrayBuffer support via COOP/COEP headers.
	// The following headers MUST be set by the HTTP server (Vite dev server, Cloud Run, or Cloud CDN):
	//   Cross-Origin-Opener-Policy: same-origin
	//   Cross-Origin-Embedder-Policy: require-corp
	// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
};

export default config;

