import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import cesium from 'vite-plugin-cesium'

export default defineConfig({
  plugins: [vue(), cesium()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: { 
    port: 5173, 
    open: true,
    fs: {
      allow: ['..'] // 允许访问上级目录
    }
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
    include: []
  },
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      external: (id) => {
        // 将ONNX Runtime相关文件标记为外部依赖
        return id.includes('ort-wasm') || id.includes('.wasm')
      }
    }
  }
})