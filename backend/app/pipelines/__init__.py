"""独立数据管道。

与 FastAPI 请求层完全解耦：不 import 路由，只依赖 `app.db` 和 `app.models`。
可以被 cron、调度器或命令行单独调用。
"""
