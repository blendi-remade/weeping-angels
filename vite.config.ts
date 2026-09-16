import { defineConfig } from 'vite';
export default defineConfig({
  server:{watch:{ignored:['**/tools/**','**/output/**','**/assets/source/**']}},
  build:{rollupOptions:{output:{manualChunks:{three:['three']}}},chunkSizeWarningLimit:650}
});
