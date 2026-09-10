import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const apiPort = process.env.BROWSER_CAPTURE_API_PORT
const cacheDirectory = process.env.BROWSER_CAPTURE_ACCEPTANCE_CACHE_DIR
if (!apiPort || !/^\d+$/.test(apiPort)) throw new Error("UI acceptance requires BROWSER_CAPTURE_API_PORT")
if (!cacheDirectory) throw new Error("UI acceptance requires BROWSER_CAPTURE_ACCEPTANCE_CACHE_DIR")

export default defineConfig({
  cacheDir: path.resolve(cacheDirectory),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    // WHY：UI 验收必须指向同一次隔离采访 API，不能静默回落到用户正在使用的 4175。
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
})
