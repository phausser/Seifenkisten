import { defineConfig } from 'vite';

// On GitHub Actions GITHUB_REPOSITORY is "owner/repo" — extract repo name
// so assets resolve correctly under https://owner.github.io/repo/
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.CI && repoName ? `/${repoName}/` : './';

export default defineConfig({
  root: '.',
  base,
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    port: 5173,
  },
});
