# Windows 一键部署

本项目在 Windows 上使用本机进程运行，不依赖 Docker：

- 前端：Next.js，默认端口 `3001`
- 后端：FastAPI，默认端口 `8000`
- 数据库：PostgreSQL，默认端口 `5432`

项目根目录已经提供三个入口：

- `一键安装依赖.bat`：安装运行环境、创建数据库、恢复数据、安装依赖并构建前端。
- `一键启动项目.bat`：执行数据库迁移，在后台启动前后端并打开浏览器。
- `一键停止项目.bat`：停止本项目启动的前后端进程。

## 1. 系统要求

- Windows 10 x64 或 Windows 11 x64。
- 运行环境安装包已经放在 `windows/installers/`，正常情况下不要求单独安装 Python、Node.js、PostgreSQL、uv 或 pnpm。
- 首次安装应用自身的 Python/npm 依赖仍然需要联网。
- `winget` 是随包文件缺失时的后备安装方式，不是必需条件。
- 复制项目时请保留 `backend/uploads/`，所有素材和已发布帖子引用的媒体文件都保存在这里。

不要在 Mac 和 Windows 之间直接复制以下目录，它们与操作系统和本机路径绑定：

```text
frontend/node_modules/
frontend/.next/
backend/.venv/
.runtime/
```

## 2. 从当前 Mac 准备迁移目录

先备份 PostgreSQL。下面的命令会生成一个完整的自定义格式备份：

```bash
cd "/Volumes/UNIS PN C2/project/test/tiebazidonghua/tieba-auto"
pg_dump -Fc -d tieba_auto -f tieba_auto.dump
```

再把源码、数据库备份和上传文件一起复制到 U 盘或目标电脑。不要复制可重新生成的依赖目录：

```bash
rsync -av \
  --exclude 'frontend/node_modules/' \
  --exclude 'frontend/.next/' \
  --exclude 'backend/.venv/' \
  --exclude '.runtime/' \
  --exclude '**/__pycache__/' \
  "./" "/Volumes/目标U盘/tieba-auto/"
```

复制完成后确认目标目录中同时存在：

```text
tieba-auto/
├── tieba_auto.dump
├── backend/uploads/
├── windows/
│   ├── installers/       # 随包 Windows 运行环境安装文件
│   ├── install.ps1
│   ├── start.ps1
│   └── stop.ps1
├── 一键安装依赖.bat
├── 一键启动项目.bat
└── 一键停止项目.bat
```

数据库备份与素材包含账号凭据和业务数据，属于敏感文件，不要提交到 Git，也不要通过公开网盘分享。

## 3. 在 Windows 安装

1. 把整个 `tieba-auto` 文件夹放到固定位置，例如 `D:\apps\tieba-auto`。安装完成后不要随意移动目录。
2. 双击 `一键安装依赖.bat`。
3. 安装过程中 Windows 可能弹出管理员授权，这通常用于 PostgreSQL 系统服务和 VC++ 运行库，请允许。
4. 如果电脑还没有 PostgreSQL，安装器会要求输入一个数据库密码。这个密码会成为 PostgreSQL `postgres` 用户的密码，请记住；它也会写入本机的 `backend/.env`。首次自动安装数据库时，密码请不要包含空格或英文双引号。
5. 如果 PostgreSQL 已经安装，请输入它现有的 `postgres` 用户密码。使用 Windows 本地信任认证时可以直接回车。
6. 等待显示 `Installation completed.`。首次安装依赖和前端构建通常需要几分钟。

安装器会自动完成：

- 优先校验并使用 `windows/installers/` 中的 Python、Node.js、PostgreSQL、uv、pnpm 和 VC++ 运行库；缺失时才回退到 `winget`。
- Python 按当前用户安装，Node.js 和 uv 解压到项目内的 `.runtime/tools/`，pnpm 直接使用随包独立程序。
- 创建 `tieba_auto` 数据库。
- 当数据库为空且根目录存在 `tieba_auto.dump` 时自动恢复备份。
- 写入 `backend/.env` 和 `frontend/.env.local`。
- 执行 `uv sync --frozen`、Alembic 数据库迁移和 `pnpm install --frozen-lockfile`。
- 完成后端依赖安装并构建前端生产版本。

随包安装文件只覆盖 Windows 运行环境。`uv sync` 和 `pnpm install` 会从软件源下载项目自身依赖，因此首次安装仍建议保持联网。

如果 `windows/installers/` 被删除，安装器会尝试回退到 `winget`。如果 PostgreSQL 或其它依赖已经手动安装，可以先把它们加入 PATH，然后运行：

```bat
一键安装依赖.bat -SkipSystemInstall
```

## 4. 启动与停止

双击 `一键启动项目.bat`。脚本会：

- 检查数据库并执行最新 Alembic 迁移。
- 后端只监听 `127.0.0.1:8000`，不对局域网暴露 API。
- 前端监听 `0.0.0.0:3001`。
- 自动识别当前活动的 IPv4 地址，打印本机访问地址和所有可用的局域网访问地址。
- 把访问地址保存到 `.runtime/access-urls.txt`。
- 在后台启动服务并自动打开本机浏览器。

本机访问：

```text
http://127.0.0.1:3001
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

停止服务时双击 `一键停止项目.bat`。停止脚本会校验 PID、启动时间和命令行，避免误杀被系统复用的 PID。

运行日志位于：

```text
.runtime/logs/
```

如果启动失败，先查看 `backend.err.log` 和 `frontend.err.log`。

## 5. 局域网访问

启动成功后，命令窗口会把实际可用地址打印出来，例如：

```text
Access addresses
  Local: http://127.0.0.1:3001
  LAN access:
    http://192.168.2.142:3001  [以太网]
```

同一局域网内的手机或其它电脑，直接打开终端中显示的 `LAN access` 地址即可。项目目录下的
`.runtime/access-urls.txt` 也会保存同一份地址，方便关闭窗口后再次查看。

如果无法访问，请确认：

- Windows 当前网络类型为“专用网络”。
- Windows 防火墙只对可信局域网放行 TCP `3001` 入站。
- 不要放行后端 `8000`，前端已经通过 Next.js 同源代理访问后端。
- 公司或校园网络可能禁止设备之间的互访。

只在本机使用时，可以运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\start.ps1 -FrontendBindHost 127.0.0.1
```

## 6. 常见问题

### 端口被占用

默认占用端口为 `8000` 和 `3001`。先双击 `一键停止项目.bat`。如果仍提示被其它程序占用，请在 PowerShell 中检查：

```powershell
Get-NetTCPConnection -LocalPort 8000,3001 -State Listen |
  Select-Object LocalPort,OwningProcess
```

不要直接结束不认识的进程，先通过 `Get-Process -Id <PID>` 确认所属程序。

### PostgreSQL 密码错误

安装器不会猜测或重置已有 PostgreSQL 密码。请使用 pgAdmin 或 PostgreSQL 安装时设置的 `postgres` 密码重新运行安装器。

### 数据库已有部分表，但没有恢复备份

自动恢复只会在 `public` schema 完全为空时执行，避免覆盖现有数据。确认目标数据库不需要旧数据后，可以删除并重新创建空数据库，再重新运行安装器：

```sql
DROP DATABASE tieba_auto;
CREATE DATABASE tieba_auto;
```

执行前务必确认当前数据库中确实没有需要保留的数据。

### 安装完成后移动了项目目录

移动目录后重新运行一次 `一键安装依赖.bat`，重新生成 Windows 下有效的 Python 虚拟环境和 Node 依赖链接。

### 升级项目代码

保留 `backend/.env`、`frontend/.env.local`、`backend/uploads/` 和数据库，然后重新运行 `一键安装依赖.bat`。安装器会应用新的数据库迁移，不会在数据库已有表时自动覆盖数据。

## 7. 数据存储位置

- 业务数据：Windows 本机 PostgreSQL 的 `tieba_auto` 数据库。
- 素材文件：项目目录下的 `backend/uploads/materials/`。
- 本机配置：`backend/.env` 和 `frontend/.env.local`。
- 运行日志：`.runtime/logs/`。

迁移到新电脑时，数据库备份与 `backend/uploads/` 必须同时迁移，否则数据库中的素材记录会找不到实际文件。
