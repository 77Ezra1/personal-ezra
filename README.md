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

## Docker 部署

使用 Docker 手动构建镜像：

```bash
docker build -t pms-web .
docker run --rm -p 8080:80 pms-web
```

或者使用 docker compose（默认暴露在 http://localhost:8080）：

```bash
docker compose up --build
```

## 功能点（MVP）
- 网站管理：新增、打开、删除
- 密码库：本地零知识加密（PBKDF2 + AES-GCM），复制时解密到剪贴板
- 命令面板：⌘/Ctrl+K 快速搜索打开
- SQLite 存储（tauri-plugin-sql）
- PWA 配置（vite-plugin-pwa）
- 笔记：Markdown 编写与大模型对话

> 默认离线运行；如配置 `VITE_LLM_API_URL`/`VITE_LLM_API_KEY` 将访问外部服务，请自行评估隐私与安全风险。
