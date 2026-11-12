"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Account } from "@/lib/api/accounts";

import { CreateAccountPanel } from "./account-create-panel";
import { EditAccountForm } from "./account-edit-form";

export function AccountFormDialog({
  onOpenChange,
  account,
}: {
  onOpenChange: (open: boolean) => void;
  account: Account | null;
}) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "编辑账号" : "添加百度贴吧账号"}</DialogTitle>
          <DialogDescription>
            {account
              ? "修改账号信息与登录凭据，留空的凭据不会被覆盖。"
              : "粘贴浏览器 Cookie，自动识别并验证账号；添加后会同步该账号关注的贴吧。"}
          </DialogDescription>
        </DialogHeader>

        {account ? (
          <EditAccountForm account={account} onClose={close} />
        ) : (
          <CreateAccountPanel onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
