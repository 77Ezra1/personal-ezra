# PMS Web (MVP)

基于 React + TypeScript + Vite + Tailwind + Zustand + Dexie (IndexedDB) 的个人管理系统最小可运行骨架。

## 本地运行

```bash
pnpm i
pnpm dev
# 构建 PWA
pnpm build && pnpm preview
```

如使用 npm/yarn：
```bash
npm i && npm run dev
# or
yarn && yarn dev
```

## 功能点（MVP）
- 网站管理：新增、打开、删除
- 密码库：本地零知识加密（PBKDF2 + AES-GCM），复制时解密到剪贴板
- 命令面板：⌘/Ctrl+K 快速搜索打开
- IndexedDB 存储（Dexie）
- PWA 配置（vite-plugin-pwa）

> 仅本地离线可用；未接入任何云端服务。
