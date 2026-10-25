/* global process */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages 的网址是 https://twu042.github.io/ReHA/，打包时要加子路径；本地开发和其他托管不受影响
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ReHA/' : '/',
  plugins: [react()],
})
