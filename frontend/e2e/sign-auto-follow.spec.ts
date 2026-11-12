import { expect, test } from "@playwright/test";

test("切换到一个尚未同步贴吧的账号时自动同步关注", async ({ page }) => {
  let synced = false;
  let syncRequests = 0;

  await page.route("**/api/v1/accounts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 900,
          username: "auto_sync_sign",
          nickname: "自动同步账号",
          status: "valid",
          status_reason: null,
          last_login_at: null,
          tieba_uid: 900,
          avatar_url: null,
          notes: null,
          has_credentials: true,
          created_at: "2026-11-11T08:00:00Z",
          updated_at: "2026-11-11T08:00:00Z",
        },
      ]),
    });
  });

  await page.route("**/api/v1/sign/accounts/900", async (route) => {
    const items = synced
      ? [
          {
            forum_id: 1,
            fname: "自动同步吧",
            level: 3,
            is_followed: true,
            is_banned: false,
            ban_reason: null,
            is_signed: false,
            last_sign_status: null,
            last_sign_at: null,
            sign_count: 0,
            history_success: 0,
            history_failed: 0,
            sign_error: null,
          },
        ]
      : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items,
        total: items.length,
        stats: {
          total: items.length,
          signed: 0,
          pending: items.length,
          failed: 0,
          banned: 0,
        },
      }),
    });
  });

  await page.route("**/api/v1/forums/sync", async (route) => {
    syncRequests += 1;
    synced = true;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fetched: 1,
        added: 1,
        updated: 0,
        skipped: 0,
        account_name: "自动同步账号",
      }),
    });
  });

  await page.goto("/sign");
  await expect(page.getByText("正在自动同步关注贴吧…")).toBeVisible();
  await expect.poll(() => syncRequests).toBe(1);
  await expect(page.getByText("自动同步吧", { exact: true })).toBeVisible();
  await expect(page.getByText("已自动同步 1 个关注贴吧")).toBeVisible();
});
