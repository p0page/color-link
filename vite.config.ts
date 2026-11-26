import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'cloudflare-web-analytics',
      apply: 'build',
      transformIndexHtml() {
        const token = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
        if (!token) return;

        return [
          {
            tag: 'script',
            attrs: {
              type: 'module',
              src: 'https://static.cloudflareinsights.com/beacon.min.js',
              'data-cf-beacon': JSON.stringify({ token }),
            },
            injectTo: 'body',
          },
        ];
      },
    },
  ],
});
