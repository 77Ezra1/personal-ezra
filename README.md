# PMS Web (MVP)

基于 React + TypeScript + Vite + Tailwind + Zustand + SQLite 的个人管理系统最小可运行骨架。

本项目推荐使用 [pnpm](https://pnpm.io/) 作为包管理器。

## 本地运行

```bash
pnpm install
pnpm dev
# 构建并预览 PWA
pnpm build && pnpm preview
```

如使用 npm 或 yarn：
```bash
npm install && npm run dev
# or
yarn && yarn dev
```

如需调用外部大模型 API，请复制 `.env.example` 为 `.env` 并配置 `VITE_LLM_API_URL` 与 `VITE_LLM_API_KEY`。

## 功能点（MVP）
- 网站管理：新增、打开、删除
- 密码库：本地零知识加密（PBKDF2 + AES-GCM），复制时解密到剪贴板
- 命令面板：⌘/Ctrl+K 快速搜索打开
- SQLite 存储（tauri-plugin-sql）
- PWA 配置（vite-plugin-pwa）
- 笔记：Markdown 编写与大模型对话

> 默认离线运行；如配置 `VITE_LLM_API_URL`/`VITE_LLM_API_KEY` 将访问外部服务，请自行评估隐私与安全风险。

## 离线能力

- 构建时预缓存核心资源（HTML、JS、CSS、图标、字体等），首次访问后即可离线打开。
- Workbox 运行时缓存 `/api/*` 与数据请求（JSON、`/data/` 路径），在网络不可用时回退到本地缓存。
- 所有导航请求自动回退到应用壳（`index.html`），确保刷新或直接访问路由时也能离线渲染页面。
