# tieba-auto 前端

贴吧自动化平台前端，使用 Next.js 16、React 19、TypeScript、Tailwind CSS 4 和 shadcn/ui。

## 启动

```bash
pnpm install
pnpm dev -p 3001
```

访问 `http://127.0.0.1:3001`。

前端通过 Next.js rewrites 将 `/api/*` 和 `/uploads/*` 代理到 FastAPI。默认地址为：

```text
http://127.0.0.1:8000
```

可在 `.env.local` 中覆盖：

```env
API_INTERNAL_URL=http://127.0.0.1:8000
```

## 检查

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

完整部署、数据库和 Windows 一键运行说明见项目根目录 [README](../README.md)。
