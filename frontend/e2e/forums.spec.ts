import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("贴吧管理可批量添加、切换发帖目标并删除", async ({ page }) => {
  const suffix = Date.now();
  const forumA = `e2e吧${suffix}`;
  const forumB = `e2e副吧${suffix}`;

  await page.goto("/forums/follow");
  await expect(page.getByRole("heading", { name: "批量关注贴吧" })).toBeVisible();

  await page.getByRole("button", { name: "添加贴吧" }).click();
  await expect(page.getByRole("dialog").getByText("添加贴吧")).toBeVisible();
  await page.getByPlaceholder(/例如：传奇/).fill(`${forumA}\n${forumB}`);
  await page.getByRole("button", { name: "添加", exact: true }).click();

  await expect(page.getByText(forumA)).toBeVisible();
  await expect(page.getByText(forumB)).toBeVisible();

  const toggle = page.getByLabel(`发帖目标-${forumA}`);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  for (const forum of [forumA, forumB]) {
    const row = page.getByRole("row", { name: new RegExp(forum) });
    await row.getByLabel("删除").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "删除", exact: true })
      .click();
    await expect(page.getByText(forum)).toHaveCount(0);
  }
});

test("贴吧池只显示手动项，账号关注页展示同步状态", async ({ page, request }) => {
  const tempName = `e2e手动吧${Date.now()}`;
  const created = await request.post("/api/v1/forums", {
    data: { names: tempName },
  });
  expect(created.ok()).toBeTruthy();
  const createdBody = (await created.json()) as { items: Array<{ id: number }> };
  const tempId = createdBody.items[0].id;

  try {
    const poolResponse = await request.get("/api/v1/forums");
    const pool = (await poolResponse.json()) as {
      items: Array<{ fname: string; source: string }>;
    };
    expect(pool.items.every((item) => item.source === "manual")).toBe(true);
    expect(pool.items.some((item) => item.fname === tempName)).toBe(true);

    const accountsResponse = await request.get("/api/v1/accounts");
    const accounts = (await accountsResponse.json()) as Array<{
      id: number;
      status: string;
      has_credentials: boolean;
    }>;
    const account =
      accounts.find((item) => item.status === "valid" && item.has_credentials) ?? accounts[0];
    const accountForumsResponse = await request.get(
      `/api/v1/forums/accounts/${account.id}`
    );
    const accountForums = (await accountForumsResponse.json()) as { total: number };
    expect(accountForums.total).toBeGreaterThan(0);

    await page.goto("/forums/follow");
    await expect(page.getByRole("heading", { name: "批量关注贴吧" })).toBeVisible();
    await expect(page.getByRole("cell", { name: tempName, exact: true })).toBeVisible();

    const checkbox = page.getByLabel(`选择-${tempName}`);
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "关注选中" })).toBeEnabled();

    await page.getByRole("link", { name: "贴吧管理" }).click();
    await expect(page.getByRole("heading", { name: "贴吧管理" })).toBeVisible();
    await expect(page.getByRole("button", { name: "同步此账号" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await expect(page.getByText("已关注").first()).toBeVisible();

    const accountCheckbox = page.getByLabel(/^选择账号贴吧-/).first();
    await accountCheckbox.click();
    await expect(page.getByRole("button", { name: "加入贴吧池" })).toBeEnabled();
  } finally {
    await request.delete(`/api/v1/forums/${tempId}`);
  }
});

test("全选时只请求未关注贴吧并自动分批", async ({ page, request }) => {
  const tempName = `e2e临时吧${Date.now()}`;
  const created = await request.post("/api/v1/forums", {
    data: { names: tempName },
  });
  expect(created.ok()).toBeTruthy();
  const createdBody = (await created.json()) as { items: Array<{ id: number }> };
  const tempId = createdBody.items[0].id;

  try {
    await page.goto("/forums/follow");
    await expect(page.getByRole("heading", { name: "批量关注贴吧" })).toBeVisible();
    await expect(page.getByRole("button", { name: "全选当前" })).toBeVisible();

    await expect(page.locator("tbody tr").first()).toBeVisible();
    const rowCount = await page.locator("tbody tr").count();
    await page.getByRole("button", { name: "全选当前" }).click();
    await expect(page.getByText(`已选 ${rowCount} 个`)).toBeVisible();

    const bodies: Array<{ forum_ids: number[] }> = [];
    await page.route("**/api/v1/forums/follow", async (route) => {
      const body = route.request().postDataJSON() as { forum_ids: number[] };
      bodies.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: body.forum_ids.length,
          failed: 0,
          items: body.forum_ids.map((forumId) => ({
            forum_id: forumId,
            fname: `forum-${forumId}`,
            success: true,
            message: "",
          })),
        }),
      });
    });

    await page.getByRole("button", { name: "关注选中" }).click();
    await expect.poll(() => bodies.length).toBeGreaterThan(0);

    const allIds = bodies.flatMap((body) => body.forum_ids);
    expect(allIds).toContain(tempId);
    for (const body of bodies) {
      expect(body.forum_ids.length).toBeLessThanOrEqual(8);
    }
  } finally {
    await request.delete(`/api/v1/forums/${tempId}`);
  }
});
