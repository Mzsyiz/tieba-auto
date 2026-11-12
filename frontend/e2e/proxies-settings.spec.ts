import { expect, test } from "@playwright/test";

test("代理池可添加节点、绑定账号并删除", async ({ page, request }) => {
  const suffix = Date.now();
  const accountName = `e2e代理账号${suffix}`;
  const proxyName = `e2e代理${suffix}`;
  const accountResponse = await request.post("/api/v1/accounts", {
    data: {
      username: accountName,
      status: "pending",
    },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = (await accountResponse.json()) as { id: number };

  try {
    await page.goto("/proxies");
    await expect(page.getByRole("heading", { name: "代理池" })).toBeVisible();
    await page.getByRole("button", { name: "添加代理" }).click();
    await page.getByLabel("节点名称").fill(proxyName);
    await page.getByLabel("主机").fill(`proxy-${suffix}.example.com`);
    await page.getByLabel("端口").fill("8080");
    await page.getByRole("button", { name: "保存节点" }).click();

    const row = page.getByRole("row", { name: new RegExp(proxyName) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("未检测");

    await row.getByRole("button", { name: "绑定账号" }).click();
    const checkbox = page.getByLabel(`绑定账号-${accountName}`);
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "保存绑定" }).click();
    await expect(row).toContainText("1 个");

    await row.getByRole("button", { name: "删除" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await expect(page.getByText(proxyName, { exact: true })).toHaveCount(0);
  } finally {
    await request.delete(`/api/v1/accounts/${account.id}`);
  }
});

test("设置页可保存网络与自动化参数", async ({ page }) => {
  const now = new Date().toISOString();
  let savedBody: Record<string, unknown> | null = null;
  const settings = {
    id: 1,
    auto_sync_forums: true,
    default_proxy_id: null,
    proxy_auto_disable: true,
    proxy_failure_threshold: 3,
    request_timeout_seconds: 30,
    follow_interval_min: 2,
    follow_interval_max: 5,
    sign_interval_min: 1,
    sign_interval_max: 3,
    post_interval_min: 10,
    post_interval_max: 30,
    post_prewarm_min: 1.2,
    post_prewarm_max: 3.5,
    max_task_total: 100,
    updated_at: now,
  };

  await page.route("**/api/v1/settings", async (route) => {
    if (route.request().method() === "PUT") {
      savedBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...settings, ...savedBody, updated_at: now }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(settings),
    });
  });
  await page.route("**/api/v1/settings/system", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        app_name: "Tieba Auto API",
        environment: "test",
        version: "0.1.0",
        account_count: 5,
        forum_count: 68,
        material_count: 10,
        proxy_count: 0,
        running_auto_sign: false,
        running_post_task: false,
      }),
    });
  });
  await page.route("**/api/v1/proxies?status=active", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        total: 0,
        stats: {
          total: 0,
          active: 0,
          online: 0,
          failed: 0,
          bound_accounts: 0,
        },
      }),
    });
  });

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByText("网络与代理")).toBeVisible();
  await expect(page.getByText("内容发布规则")).toBeVisible();
  await page.getByLabel("失败阈值").fill("6");
  await page.getByLabel("请求超时").fill("45");
  await page.getByLabel("添加账号后自动同步关注贴吧").click();
  await page.getByRole("button", { name: "保存设置" }).first().click();

  await expect.poll(() => savedBody !== null).toBe(true);
  expect(savedBody).toMatchObject({
    auto_sync_forums: false,
    proxy_failure_threshold: 6,
    request_timeout_seconds: 45,
  });
});
