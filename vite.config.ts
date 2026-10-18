import { defineConfig } from 'vite';

// base 用相对路径,这样同一份构建既能放在任意网址下,也能被 Capacitor 安卓壳加载
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  test: { include: ['tests/**/*.test.ts'] },
});
