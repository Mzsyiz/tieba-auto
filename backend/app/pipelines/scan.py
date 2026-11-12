"""示例数据管道：扫描账号库并输出状态统计。

运行方式：
    uv run python -m app.pipelines.scan
"""

from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models.account import Account


def main() -> None:
    with SessionLocal() as db:
        rows = db.execute(
            select(Account.status, func.count(Account.id)).group_by(Account.status)
        ).all()
        total = sum(count for _, count in rows)
        print(f"账号总数: {total}")
        for status_name, count in rows:
            print(f"  {status_name}: {count}")


if __name__ == "__main__":
    main()
