import { expect, test } from "@playwright/test";

test("签到页可选中贴吧并提交签到请求", async ({ page }) => {
  await page.goto("/sign");

  await expect(page.getByRole("heading", { name: "签到任务" })).toBeVisible();
  await expect(page.getByRole("button", { name: /签到全部待签/ })).toBeVisible();

  const checkbox = page.getByLabel(/^选择签到-/).first();
  await expect(checkbox).toBeVisible();
  await checkbox.click();
  await expect(checkbox).toHaveAttribute("aria-checked", "true");

  const signButton = page.getByRole("button", { name: "签到选中" });
  await expect(signButton).toBeEnabled();

  const bodies: Array<{ forum_ids: number[] | null }> = [];
  await page.route("**/api/v1/sign/accounts/*/sign", async (route) => {
    const body = route.request().postDataJSON() as { forum_ids: number[] | null };
    bodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: body.forum_ids?.length ?? 0,
        already: 0,
        failed: 0,
        items: (body.forum_ids ?? []).map((forumId) => ({
          forum_id: forumId,
          fname: `forum-${forumId}`,
          success: true,
          already_signed: false,
          status: "success",
          message: "签到成功",
        })),
      }),
    });
  });

  await signButton.click();
  await expect.poll(() => bodies.length).toBeGreaterThan(0);

  const forumIds = bodies[0].forum_ids ?? [];
  expect(forumIds.length).toBeGreaterThan(0);
  expect(forumIds.length).toBeLessThanOrEqual(8);
});
