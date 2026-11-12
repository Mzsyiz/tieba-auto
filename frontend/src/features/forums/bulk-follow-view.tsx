"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ForumCreateDialog } from "./forum-create-dialog";
import { ForumHeader } from "./forum-header";
import { ForumPoolTab } from "./forum-pool-tab";
import { useForumAccounts } from "./use-forum-accounts";

export function BulkFollowView() {
  const { accounts, accountId, account, accountIdNumber, setSelectedAccountId } =
    useForumAccounts();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4 p-6">
      <ForumHeader
        title="批量关注贴吧"
        description="手动维护贴吧池，选择贴吧后批量关注到当前账号"
        accountId={accountId}
        account={account}
        accounts={accounts}
        onAccountChange={setSelectedAccountId}
      >
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          添加贴吧
        </Button>
      </ForumHeader>

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          还没有账号，请先到「账号管理」添加百度贴吧账号。
        </p>
      ) : null}

      <ForumPoolTab
        key={`pool-${accountId}`}
        accountId={accountIdNumber}
        account={account}
      />

      {createOpen ? (
        <ForumCreateDialog open onOpenChange={setCreateOpen} accounts={accounts} />
      ) : null}
    </div>
  );
}
