"use client";

import { AccountForumsTab } from "./account-forums-tab";
import { ForumHeader } from "./forum-header";
import { useForumAccounts } from "./use-forum-accounts";

export function ForumsView() {
  const { accounts, accountId, account, accountIdNumber, setSelectedAccountId } =
    useForumAccounts();

  return (
    <div className="space-y-4 p-6">
      <ForumHeader
        title="贴吧管理"
        description="查看和处理当前账号下的贴吧，可将选中的贴吧加入手动吧池"
        accountId={accountId}
        account={account}
        accounts={accounts}
        onAccountChange={setSelectedAccountId}
      />

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          还没有账号，请先到「账号管理」添加百度贴吧账号。
        </p>
      ) : null}

      <AccountForumsTab
        key={`account-${accountId}`}
        accountId={accountIdNumber}
        account={account}
      />
    </div>
  );
}
