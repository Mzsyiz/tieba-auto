import { expect, test } from "@playwright/test";

test("素材库可添加、标记使用、编辑和删除素材", async ({ page }) => {
  const title = `e2e素材${Date.now()}`;
  const updatedTitle = `${title}-改`;

  await page.goto("/materials");
  await expect(page.getByRole("heading", { name: "素材库" })).toBeVisible();

  await page.getByRole("button", { name: "添加素材" }).click();
  await expect(page.getByRole("dialog").getByText("添加素材")).toBeVisible();
  await page.getByLabel("标题").fill(title);
  await page.getByLabel("正文").fill("这是一条端到端测试素材正文。");
  await page.getByLabel("标签").fill("e2e, 测试");
  await page.getByRole("button", { name: "保存", exact: true }).click();

  let card = page.locator("[data-material-card]").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("可用");

  await card.getByRole("button", { name: "标记已用" }).click();
  await expect(card).toContainText("已使用");

  await card.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("标题").fill(updatedTitle);
  await page.getByRole("button", { name: "保存", exact: true }).click();

  card = page.locator("[data-material-card]").filter({ hasText: updatedTitle });
  await expect(card).toBeVisible();
  await expect(card).toContainText("普通帖");

  await card.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0);
});

test("发视频与普通发帖独立，视频帖只允许一个视频", async ({ page }) => {
  const title = `e2e视频帖${Date.now()}`;

  await page.goto("/materials");
  await page.getByRole("button", { name: "添加素材" }).click();
  await page.getByRole("button", { name: /发视频/ }).click();

  await expect(page.getByRole("button", { name: "上传视频" })).toBeVisible();
  await expect(page.getByRole("button", { name: "上传图片" })).toHaveCount(0);
  await page.getByLabel("标题").fill(title);
  await page.getByPlaceholder("或粘贴视频直链").fill("https://example.com/demo.mp4");
  await page.getByRole("dialog").getByRole("button", { name: "添加链接" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const card = page.locator("[data-material-card]").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("视频帖");
  await expect(card).toContainText("未填写视频简介");

  await card.getByRole("button", { name: "删除" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
});
