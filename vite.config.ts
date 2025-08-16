import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  base: './', // Usar caminhos relativos para funcionar no Electron
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
