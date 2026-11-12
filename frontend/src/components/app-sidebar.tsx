"use client";

import {
  Bot,
  CalendarCheck,
  HeartPlus,
  LayoutGrid,
  Library,
  MessageSquareText,
  Network,
  Send,
  Settings,
  Timer,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/accounts", label: "账号管理", icon: Users },
  { href: "/forums/follow", label: "批量关注贴吧", icon: HeartPlus },
  { href: "/forums", label: "贴吧管理", icon: LayoutGrid },
  { href: "/posts", label: "发帖任务", icon: Send },
  { href: "/post-manage", label: "帖子管理", icon: MessageSquareText },
  { href: "/sign/auto", label: "自动签到", icon: Timer },
  { href: "/sign", label: "签到任务", icon: CalendarCheck },
  { href: "/materials", label: "素材库", icon: Library },
  { href: "/proxies", label: "代理池", icon: Network },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        aria-label="返回首页"
        className="flex h-14 items-center gap-2 border-b px-4 transition-colors hover:bg-sidebar-accent/60"
      >
        <Bot className="size-5" />
        <span className="font-heading text-sm font-semibold">贴吧自动化平台</span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">v0.1.0 · 开发版</div>
    </aside>
  );
}
