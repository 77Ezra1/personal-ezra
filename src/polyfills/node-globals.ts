// src/polyfills/node-globals.ts
// 为 Tauri/WebView 注入 Node 常用全局，供 gray-matter 等依赖使用。
// 仅在缺失时注入，不污染已有实现。

import { Buffer } from 'buffer'
// @ts-ignore
;(globalThis as any).Buffer ??= Buffer

// 如后续某些库需要 process，再取消注释下面两行：
// import process from 'process'
// ;(globalThis as any).process ??= process
