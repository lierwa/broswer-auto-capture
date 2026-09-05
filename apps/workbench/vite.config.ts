import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({ plugins: [react()], server: {
  host: "127.0.0.1",
  // WHY：开发与构建页面共用正式 API；保留原始 Host/Origin，由 API 核验本机同源。
  proxy: { "/api": { target: `http://127.0.0.1:${process.env.BROWSER_CAPTURE_API_PORT ?? 4175}`, changeOrigin: false } },
} })
