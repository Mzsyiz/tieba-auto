# Windows 运行环境安装包

这些文件仅适用于 Windows x64。`一键安装依赖.bat` 会优先校验并使用这里的本地文件；
文件缺失时才回退到 `winget`。

| 文件 | 用途 |
| --- | --- |
| `python-3.12.10-amd64.exe` | Python 3.12，按当前用户安装 |
| `node-v24.22.1-win-x64.zip` | Node.js LTS 便携包，解压到 `.runtime/tools/node/` |
| `node-v24.22.1-x64.msi` | Node.js MSI，仅在便携包缺失时作为后备 |
| `postgresql-16.9-3-windows-x64.exe` | PostgreSQL 16，安装为本机系统服务 |
| `uv-x86_64-pc-windows-msvc.zip` | uv 便携包，解压到 `.runtime/tools/uv/` |
| `pnpm-win-x64.exe` | pnpm 10.9 独立程序 |
| `VC_redist.x64.exe` | Microsoft VC++ 2015-2022 x64 运行库备用安装包 |

官方来源：

- Python: <https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe>
- Node.js: <https://nodejs.org/dist/v24.22.1/>
- PostgreSQL: <https://get.enterprisedb.com/postgresql/postgresql-16.9-3-windows-x64.exe>
- uv: <https://github.com/astral-sh/uv/releases/tag/0.9.30>
- pnpm: <https://github.com/pnpm/pnpm/releases/tag/v10.9.0>
- VC++ 运行库: <https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist>

这些安装文件只覆盖 Windows 运行环境。项目自身的 Python 和 npm 依赖仍由
`uv sync`、`pnpm install` 从软件源安装。文件哈希见同目录的 `SHA256SUMS.txt`。
