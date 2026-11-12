import { expect, test } from "@playwright/test";

test("自动签到页可选择账号并提交启动请求", async ({ page }) => {
  await page.goto("/sign/auto");

  await expect(page.getByRole("heading", { name: "自动签到" })).toBeVisible();
  await expect(page.getByLabel("贴吧间隔最小值")).toBeVisible();
  await expect(page.getByLabel("账号间隔最大值")).toBeVisible();
  await expect(page.getByRole("button", { name: "立即自动签到" })).toBeEnabled();

  const checkboxes = page.getByLabel(/^选择自动账号-/);
  const checkboxCount = await checkboxes.count();
  let checkbox = checkboxes.first();
  for (let index = 0; index < checkboxCount; index += 1) {
    const candidate = checkboxes.nth(index);
    if (await candidate.isEnabled()) {
      checkbox = candidate;
      break;
    }
  }
  if ((await checkbox.getAttribute("aria-checked")) !== "true") {
    await checkbox.click();
  }
  await expect(checkbox).toHaveAttribute("aria-checked", "true");

  const startBodies: Array<{ account_ids: number[] | null }> = [];
  const settingsBodies: Array<{ account_ids: number[] }> = [];
  let started = false;

  await page.route("**/api/v1/sign/auto/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        account_ids: number[];
        enabled: boolean;
        schedule_time: string;
        interval_min: number;
        interval_max: number;
        account_interval_min: number;
        account_interval_max: number;
      };
      settingsBodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...body, last_run_date: null }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/v1/sign/auto/start", async (route) => {
    const body = route.request().postDataJSON() as {
      account_ids: number[] | null;
    };
    startBodies.push(body);
    started = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        running: true,
        started_at: new Date().toISOString(),
        finished_at: null,
        current_account_id: body.account_ids?.[0] ?? null,
        current_account_name: "测试账号",
        account_index: 1,
        account_total: 1,
        current_forum: "",
        forum_index: 0,
        forum_total: 0,
        success: 0,
        already: 0,
        failed: 0,
        skipped: 0,
        message: "准备中",
        recent_errors: [],
      }),
    });
  });

  await page.route("**/api/v1/sign/auto/status", async (route) => {
    if (!started) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        running: true,
        started_at: new Date().toISOString(),
        finished_at: null,
        current_account_id: 1,
        current_account_name: "测试账号",
        account_index: 1,
        account_total: 1,
        current_forum: "测试吧",
        forum_index: 1,
        forum_total: 10,
        success: 1,
        already: 0,
        failed: 0,
        skipped: 0,
        message: "签到中",
        recent_errors: [],
      }),
    });
  });

  await page.getByRole("button", { name: "立即自动签到" }).click();
  await expect.poll(() => startBodies.length).toBeGreaterThan(0);

  const accountIds = startBodies[0].account_ids ?? [];
  expect(accountIds.length).toBeGreaterThan(0);
  expect(settingsBodies[0].account_ids).toEqual(accountIds);
  await expect(page.getByText("运行中", { exact: true })).toBeVisible();
});
