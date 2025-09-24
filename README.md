# Personal (MVP)

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

## 主要功能

- **灵感妙记（本地 Markdown 笔记）**：桌面端离线存储在 Tauri 数据目录，可新建、编辑、删除笔记；正文会自动提取 `#标签` 并与手动标签合并，左侧列表仅展示标题与标签以压缩空间，同时支持标题/正文关键字与 `#标签` 搜索，实时 Markdown 预览帮助快速校验排版。
- **密码库**：本地零知识加密（PBKDF2 + AES-GCM），支持即时解密复制到剪贴板，并可扩展 TOTP/附加字段，确保敏感数据不离开设备；支持自定义自动锁定时长，可选在窗口失焦时立即锁定（默认关闭）。
- **网站管理**：记录常用站点，支持新增、快速打开与删除，可配合命令面板快速检索。
- **命令面板**：通过 ⌘/Ctrl + K 打开统一入口，搜索站点、笔记等关键操作。
- **离线优先的数据与同步基础**：内置 SQLite（`tauri-plugin-sql`）、IndexedDB 与本地文件系统读写，PWA 通过 `vite-plugin-pwa` 预缓存核心资源，Workbox 运行时缓存接口，离线时依旧可以浏览与编辑核心数据。

### GitHub 备份

GitHub 备份用于在本地冗余之外，将加密后的 `pms-backup-*.json` 推送到远端仓库，确保设备丢失或磁盘损坏时仍能恢复数据。

**准备条件**

- 在 GitHub 上准备一个用于备份的私有仓库（例如 `username/personal-backup`），并为备份文件预留独立分支（如 `backups`），避免与主干代码混杂。
- 生成 Fine-grained PAT 或经典 PAT，至少授予 `repo`（读写私有仓库）、`workflow`（触发/查询 Actions）以及细粒度令牌下的 `Contents: Read and write` 等权限，以便推送备份文件与触发相关自动化；如需写入自定义子目录，请确保令牌覆盖该路径范围。
- 桌面端（Tauri）已内置所需的 FS/Dialog/Shell 插件权限，无需额外配置；Web/PWA 部署亦不需要额外环境变量，只需保证运行环境能够访问 `api.github.com`。

**配置与运行步骤**

1. 打开应用的“设置 → GitHub 连接”，粘贴上述访问令牌并提交。验证成功后会显示 GitHub 用户名，令牌会被加密保存在本地，可随时点击“断开 GitHub 连接”撤销。
2. 切换到“设置 → 数据备份”页签，在 GitHub 备份区块填写 `owner/repo`、用于保存备份的分支名称以及可选的子目录前缀。保存后，这些信息会与 GitHub 令牌一起用于后续同步。
3. 手动备份：在同一页面输入当前主密码，点击“立即测试备份”或“导出备份”。应用会先生成加密的 `pms-backup-时间戳.json`，随后使用 GitHub API 将其推送到上一步指定的分支，成功后会弹出包含提交哈希或远端路径的提示。
4. 自动备份：开启“自动备份”开关并设定间隔（单位分钟）。桌面端会由 Tauri 后端在后台调度，Web 端则在标签页保持激活时通过前端定时器执行。每次任务会同时尝试写入本地目录并推送 GitHub，连续失败达到阈值后会自动暂停。
5. 验证同步结果：在 GitHub 仓库的对应分支查看最新提交，确认 `pms-backup-时间戳.json` 是否更新；若配置了 Actions，可在仓库的 Actions 标签页确认 Workflow Dispatch 的执行记录。必要时可下载该文件并通过“导入备份”功能验证能否解密。

**本地备份与 GitHub 备份的差异与注意事项**

- 本地备份会在选定目录生成加密文件，不依赖网络且速度更快；GitHub 备份依赖访问令牌与网络连通性，提交历史会保留多份文件，适合长期异地冗余。
- 两者可以同时启用：自动备份会先写入本地，再推送到 GitHub。若远端推送失败，本地文件仍会保留，并在设置页显示警告以便排查。
- 备份文件虽已加密，仍包含高度敏感数据。请确保仓库为私有、访问令牌定期轮换，并根据需要在 GitHub 端配置保留策略或手动清理旧版本。

> 默认离线运行

## 离线能力

- 构建时预缓存核心资源（HTML、JS、CSS、图标、字体等），首次访问后即可离线打开。
- Workbox 运行时缓存 `/api/*` 与数据请求（JSON、`/data/` 路径），在网络不可用时回退到本地缓存。
- 所有导航请求自动回退到应用壳（`index.html`），确保刷新或直接访问路由时也能离线渲染页面。
