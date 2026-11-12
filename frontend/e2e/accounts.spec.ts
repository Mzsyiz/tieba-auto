import { expect, test } from "@playwright/test";

test("账号管理页面加载并可新增账号", async ({ page, request }) => {
  const username = `e2e_${Date.now()}`;

  try {
    await page.goto("/accounts");

    await expect(page.getByRole("heading", { name: "账号管理" })).toBeVisible();
    await expect(page.getByRole("link", { name: "账号管理" })).toBeVisible();

    await page.getByRole("button", { name: "添加账号" }).click();
    await expect(page.getByText("添加百度贴吧账号")).toBeVisible();

    // 长 Cookie 不应把底部操作按钮顶出视口
    await page
      .getByPlaceholder(/粘贴整段 Cookie/)
      .fill(`BDUSS=${"a".repeat(500)}; STOKEN=${"b".repeat(200)}`);
    await expect(page.getByRole("button", { name: "验证并添加" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "跳过验证直接保存" })).toBeInViewport();

    await page
      .getByPlaceholder(/粘贴整段 Cookie/)
      .fill(`BDUSS=e2e_${Date.now()}; STOKEN=e2e-stoken`);
    await page.getByPlaceholder("留空会自动使用贴吧昵称").fill(username);
    await page.getByRole("button", { name: "跳过验证直接保存" }).click();

    await expect(page.getByRole("row", { name: new RegExp(username) })).toBeVisible();
  } finally {
    const accountsResponse = await request.get("/api/v1/accounts");
    const accounts = (await accountsResponse.json()) as Array<{
      id: number;
      username: string;
    }>;
    const created = accounts.find((account) => account.username === username);
    if (created) {
      await request.delete(`/api/v1/accounts/${created.id}`);
    }
  }
});

test("小屏粘贴长 Cookie 时操作按钮仍在视口内", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 560 });
  await page.goto("/accounts");
  await page.getByRole("button", { name: "添加账号" }).click();

  const cookieInput = page.getByPlaceholder(/粘贴整段 Cookie/);
  await cookieInput.fill(`BDUSS=${"a".repeat(800)}; STOKEN=${"b".repeat(300)}`);

  const box = await cookieInput.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(160);
  await expect(page.getByRole("button", { name: "验证并添加" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "跳过验证直接保存" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "取消", exact: true })).toBeInViewport();
});
