# Tieba Auto 后端

贴吧自动化发布平台的后端 API，采用 FastAPI + SQLAlchemy 2 + PostgreSQL。

## 快速开始

```bash
uv sync                 # 安装依赖并创建 .venv
cp .env.example .env    # 按需修改 DATABASE_URL
uv run alembic upgrade head   # 执行数据库迁移
uv run uvicorn app.main:app --reload --port 8000
```

接口文档：http://127.0.0.1:8000/docs

## 目录结构

- `app/api`：HTTP 请求层（路由、依赖）
- `app/models`：SQLAlchemy ORM 模型
- `app/schemas`：Pydantic 请求/响应模型
- `app/db`：引擎、会话、Base
- `app/pipelines`：独立数据管道，与 FastAPI 请求层解耦

## 数据管道

数据任务不依赖 HTTP 请求层，可单独运行：

```bash
uv run python -m app.pipelines.scan
```
