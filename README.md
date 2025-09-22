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

> **macOS DMG 构建注意**：如需在 macOS 上运行 `pnpm tauri:build` 生成 DMG，请先确保 Tauri 的可选依赖已安装；若之前跳过了可选依赖，请删除 `node_modules` 与 `pnpm-lock.yaml` 后执行 `pnpm install --include-optional`（或显式安装 `@tauri-apps/cli-darwin-*`）。该步骤需在执行 `pnpm tauri:build` 之前完成，以便在复制 `.app` Bundle 时找到 DMG 打包脚本。

如使用 npm 或 yarn：
```bash
npm install && npm run dev
# or
yarn && yarn dev
```

## Docker 部署

使用 Docker 手动构建镜像：

```bash
docker build -t Personal .
docker run --rm -p 8080:80 Personal
```

或者使用 docker compose（默认暴露在 http://localhost:8080）：

```bash
docker compose up --build
```
## 代码规范

项目已集成 ESLint 与 Prettier，用以下命令保持代码风格一致：

```bash
pnpm lint         # 运行 ESLint
pnpm lint:fix     # 自动修复可修复问题
pnpm format       # 使用 Prettier 重写文件
pnpm format:check # 仅检查格式
```

提交代码时 Husky 会自动执行 `pnpm lint` 作为 pre-commit 钩子。

## 功能点（MVP）
- 网站管理：新增、打开、删除
- 密码库：本地零知识加密（PBKDF2 + AES-GCM），复制时解密到剪贴板
- 命令面板：⌘/Ctrl+K 快速搜索打开
- SQLite 存储（tauri-plugin-sql）
- PWA 配置（vite-plugin-pwa）

> 默认离线运行

## 离线能力

- 构建时预缓存核心资源（HTML、JS、CSS、图标、字体等），首次访问后即可离线打开。
- Workbox 运行时缓存 `/api/*` 与数据请求（JSON、`/data/` 路径），在网络不可用时回退到本地缓存。
- 所有导航请求自动回退到应用壳（`index.html`），确保刷新或直接访问路由时也能离线渲染页面。
