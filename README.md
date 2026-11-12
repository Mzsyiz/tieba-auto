# tieba-auto

贴吧账号、贴吧、签到、素材、发帖任务、帖子与代理的一体化管理平台。

项目采用「单体 API + 单数据库 + 独立后台任务」结构，前后端分离，面向 Windows 本地部署。

> 请仅用于管理自己有权使用的账号，并遵守百度贴吧及相关服务的规则。仓库中的示例配置不包含任何真实账号凭据。

## 功能概览

### 账号与贴吧

- 账号列表、添加、编辑、删除、搜索与状态筛选。
- 支持粘贴整段 Cookie 自动提取 `BDUSS/STOKEN`，也可手动填写。
- 支持账号在线验证、重新验证，并同步昵称、UID、头像和失效原因。
- 手动维护发帖贴吧池；同步账号关注贴吧时不会自动污染发帖池。
- 查看账号关注贴吧的等级、签到状态、账号级封禁状态，支持同步与取关。
- 批量关注支持多选贴吧，并按照可配置间隔逐个执行。

### 签到

- 按账号查看今日签到进度、连续签到天数与历史记录。
- 支持单吧签到、勾选签到和全部待签。
- 自动签到支持多账号、间隔配置、每日计划时间、实时进度与停止。
- 自动签到、手动批量签到和发帖任务之间提供互斥保护。

### 素材库

- 普通图文帖与视频帖分开管理。
- 普通帖支持正文、标签和最多 10 张配图。
- 视频帖支持视频文件与可选简介。
- 素材状态、使用次数、最近使用时间和启停状态可追踪。

### 发帖任务

- 账号 × 贴吧 × 素材组合，按轮换策略生成发布任务。
- 支持账号级、贴吧级和素材级可用性校验。
- 支持随机发帖间隔、计划时间、任务复制、编辑、启动、停止与进度日志。
- 带计划时间的任务在到达计划时间前由服务端强制禁止启动，到点后由调度器自动开始。
- 图文发布使用贴吧 PC 图床上传和当前 PC 发帖接口：
  - 图片上传：`/c/s/uploadPicture_pc`
  - 主题提交：`/c/c/thread/add_pc`
  - 正文图片标记：`#(pic,picId,width,height)`
- 图片上传、预热和帖子提交复用 HTTP 连接；连接建立阶段的超时支持安全重试。
- 百度 Web 请求使用 aiohttp + TLS 1.2 + IPv4，避免 Windows 上 HTTPX/TLS 握手超时。
- 服务重启后，遗留的 `running` 任务会收口为已停止，避免永久卡住。

### 帖子与代理

- 帖子管理按账号查看已发布主题帖、正文和媒体。
- 支持打开原帖、复制内容到素材库、删除贴吧服务器上的帖子。
- 代理池支持 HTTP/HTTPS 节点、批量导入、测速、启停和账号绑定。
- 账号请求的登录、关注、签到、发帖与图床上传会使用绑定的代理。

### 首页与设置

- 首页汇总账号、贴吧、素材、任务、签到、代理健康和近期异常。
- 设置页持久化默认代理、失败阈值、请求超时、关注/签到/发帖间隔和任务容量。

## 系统架构

```text
Browser
   │
   ▼
Next.js :3001
   │  /api/* 同源代理
   ▼
FastAPI :8000
   ├── SQLAlchemy 2 ── PostgreSQL :5432
   ├── 独立后台任务（签到调度、发帖调度）
   ├── aiotieba（账号、贴吧、签到）
   └── aiohttp（图床上传、PC 发帖）
```

后端默认只监听 `127.0.0.1:8000`。对局域网开放的是前端 `3001`，浏览器通过 Next.js 同源代理访问 API。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS 4、shadcn/ui |
| 数据请求 | TanStack Query、OpenAPI 生成类型 |
| API | FastAPI、Pydantic |
| 数据库 | PostgreSQL、SQLAlchemy 2、Alembic |
| 贴吧通信 | aiotieba、aiohttp |
| 后台任务 | Python asyncio，独立于 FastAPI 请求处理 |
| 工程工具 | pnpm、uv、Ruff、mypy、Vitest、Playwright、pytest |

## Windows 一键部署

### 电脑要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 x64 或 Windows 11 x64 |
| 权限 | 安装 PostgreSQL/VC++ 时需要管理员授权 |
| 网络 | 首次安装应用依赖时需要联网 |
| 磁盘 | 建议至少预留 3 GB |
| 可选工具 | `winget`，仅在没有随包安装文件时作为后备 |

从 GitHub 克隆源码时，依赖安装器不会进入 Git。仓库版本会尝试通过 `winget` 安装 Python、Node.js、PostgreSQL 和 uv。

项目迁移压缩包中可以附带经 SHA-256 校验的官方 x64 安装文件：

| 依赖 | 随包版本 |
| --- | --- |
| Python | 3.12.10 |
| Node.js | 24.22.1 LTS |
| PostgreSQL | 16.9 |
| uv | 0.9.30 |
| pnpm | 10.9.0 |
| VC++ Runtime | Microsoft 2015-2022 x64 |

### 启动步骤

1. 将项目放到固定目录，例如 `D:\apps\tieba-auto`。
2. 双击 `一键安装依赖.bat`。
3. 输入 PostgreSQL `postgres` 用户密码；首次安装数据库时不要使用空格或英文双引号。
4. 等待 `Installation completed.`。
5. 双击 `一键启动项目.bat`。
6. 访问 `http://127.0.0.1:3001`。
7. 停止服务时双击 `一键停止项目.bat`。

启动窗口会列出本机地址和所有活动局域网地址，并保存到：

```text
.runtime/access-urls.txt
```

示例：

```text
Local: http://127.0.0.1:3001
LAN:   http://192.168.1.20:3001  [以太网]
```

局域网无法访问时，只需在 Windows 防火墙的“专用网络”中放行 TCP `3001`，不要放行后端 `8000`。

完整迁移、升级、端口和数据库故障处理见 [WINDOWS_DEPLOY.md](WINDOWS_DEPLOY.md)。

## 本地开发

### 后端

要求 Python 3.11 或 3.12、PostgreSQL，以及 `uv`。

```bash
cd backend
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

### 前端

要求 Node.js >= 20.9 和 pnpm 10。

```bash
cd frontend
pnpm install
pnpm dev -p 3001
```

访问：

```text
http://127.0.0.1:3001
```

前端通过 `frontend/.env.local` 中的 `API_INTERNAL_URL` 配置后端地址，默认是 `http://127.0.0.1:8000`。

### OpenAPI 类型

后端运行后执行：

```bash
cd frontend
pnpm generate:api
```

## 配置

| 文件 | 内容 |
| --- | --- |
| `backend/.env` | 数据库连接、CORS、默认贴吧操作间隔 |
| `frontend/.env.local` | Next.js 到后端的内部代理地址 |
| `backend/.env.example` | 后端配置模板 |
| `frontend/.env.example` | 前端配置模板 |

应用内的代理、请求超时、账号自动同步、签到间隔、发帖间隔和任务容量保存在 PostgreSQL 的 `app_settings` 表中，通过“设置”页面修改。

## 数据、备份与迁移

完整数据由两部分组成：

1. PostgreSQL 数据库 `tieba_auto`。
2. `backend/uploads/` 中的图片、视频等素材文件。

导出数据库：

```bash
pg_dump -Fc -d tieba_auto -f tieba_auto.dump
```

迁移到新电脑时必须同时复制：

```text
tieba_auto.dump
backend/uploads/
```

Windows 安装器只在目标数据库为空时自动恢复 dump，不会覆盖已有数据库。

以下内容不会提交到 Git：

- `backend/.env`
- `frontend/.env.local`
- `tieba_auto.dump`
- `backend/uploads/`
- Python/Node 依赖与构建产物
- Windows 二进制安装包

## 测试与检查

```bash
# 后端
cd backend
uv run ruff check .
uv run mypy app
uv run pytest

# 前端
cd frontend
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Playwright 端到端测试会操作测试页面或本地服务，执行前应确认数据库和测试环境。

## 安全说明

- `BDUSS/STOKEN`、代理密码和数据库备份均属于敏感信息。
- API 不会在账号列表中返回 Cookie 原文，但数据库当前仍以明文保存账号和代理凭据。
- 不要把运行数据目录、数据库 dump 或迁移压缩包上传到公开仓库。
- 生产或多人使用环境建议增加字段级加密、密钥轮换、访问控制、审计日志和 HTTPS。
- 自动化操作存在平台风控风险，建议低频率运行并仅操作自己的账号。

## 已知限制

- 自动视频发帖通道尚未接入；视频素材不会静默降级为普通文字帖。
- 当前是单 API、单数据库、单机后台任务结构，尚未拆分任务队列、缓存或搜索服务。
- 账号和代理凭据尚未实现字段级加密。
- 百度接口及风控规则可能变化，发帖和签到功能需要持续回归验证。

## 目录结构

```text
tieba-auto/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI 路由
│   │   ├── core/         # 贴吧通信、发帖、帖子管理
│   │   ├── db/           # SQLAlchemy 会话
│   │   ├── models/       # ORM 模型
│   │   ├── pipelines/    # 独立数据任务
│   │   ├── schemas/      # Pydantic 模型
│   │   └── services/     # 签到、发帖、代理等业务服务
│   ├── alembic/          # 数据库迁移
│   └── tests/            # pytest
├── frontend/
│   ├── src/app/          # Next.js 路由
│   ├── src/features/     # 业务页面和组件
│   ├── src/lib/api/      # API 客户端与 OpenAPI 类型
│   └── e2e/              # Playwright
├── windows/              # 一键安装、启动、停止脚本
├── WINDOWS_DEPLOY.md     # Windows 部署与故障处理
└── README.md
```

## 仓库

```text
https://github.com/Mzsyiz/tieba-auto
```
