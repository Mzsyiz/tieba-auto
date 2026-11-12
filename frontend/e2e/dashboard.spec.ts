import { expect, test } from "@playwright/test";

test("左上角品牌入口进入首页并展示统计", async ({ page }) => {
  await page.route("**/api/v1/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        overview: {
          account_total: 5,
          account_valid: 4,
          account_with_credentials: 5,
          followed_forums: 74,
          manual_forums: 9,
          material_total: 10,
          material_video: 2,
          proxy_total: 3,
          proxy_active: 2,
          proxy_online: 1,
        },
        tasks: {
          total: 3,
          pending: 1,
          running: 0,
          completed: 1,
          failed: 1,
          stopped: 0,
          jobs_total: 8,
          jobs_success: 6,
          jobs_failed: 2,
        },
        signs: {
          today_total: 52,
          success: 50,
          already: 0,
          failed: 2,
          seven_day_success: 120,
          seven_day_failed: 4,
        },
        runners: {
          auto_sign_running: false,
          auto_sign_message: "空闲",
          post_task_running: false,
          post_task_message: "空闲",
        },
        recent_tasks: [
          {
            id: 8,
            name: "首页测试发帖任务",
            status: "completed",
            total: 4,
            completed: 4,
            success: 3,
            failed: 1,
            scheduled_at: null,
            created_at: "2026-11-11T08:00:00Z",
          },
        ],
        recent_signs: [
          {
            id: 1,
            account_name: "测试账号",
            fname: "传奇吧",
            status: "success",
            message: "签到成功",
            signed_at: "2026-11-11T08:00:00Z",
          },
        ],
        recent_post_failures: [],
        generated_at: "2026-11-11T09:00:00Z",
      }),
    });
  });

  await page.goto("/accounts");
  await page.getByRole("link", { name: "返回首页" }).click();

  await expect(page).toHaveURL("http://127.0.0.1:3001/");
  await expect(page.getByRole("heading", { name: "贴吧自动化概览" })).toBeVisible();
  await expect(page.getByText("有效账号", { exact: true })).toBeVisible();
  await expect(page.getByText("账号关注贴吧", { exact: true })).toBeVisible();
  await expect(page.getByText("素材总数", { exact: true })).toBeVisible();
  await expect(page.getByText("今日签到", { exact: true })).toBeVisible();
  await expect(page.getByText("首页测试发帖任务")).toBeVisible();
  await expect(page.getByText("传奇吧")).toBeVisible();
  await expect(page.getByRole("link", { name: /新建发帖任务/ })).toBeVisible();
});
