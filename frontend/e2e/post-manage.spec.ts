import { expect, test } from "@playwright/test";

test("帖子管理可查看、编辑到素材库并删除主题帖", async ({ page }) => {
  const post = {
    fid: 42,
    fname: "传奇吧",
    tid: 123456789,
    pid: 987654321,
    title: "e2e 帖子管理标题",
    content: "这是账号当前发布的一条主题帖正文。",
    image_urls: [],
    video_url: null,
    view_num: 120,
    reply_num: 8,
    agree_num: 3,
    created_at: "2026-11-11T08:00:00Z",
    url: "https://tieba.baidu.com/p/123456789?fid=42&kw=%E4%BC%A0%E5%A5%87",
  };
  const deleteBodies: unknown[] = [];

  await page.route("**/api/v1/account-posts?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [post],
        page: 1,
        page_size: 20,
        has_more: false,
      }),
    });
  });
  await page.route("**/api/v1/account-posts/delete", async (route) => {
    deleteBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "帖子已从贴吧服务器删除",
      }),
    });
  });

  await page.goto("/post-manage");
  await expect(page.getByRole("heading", { name: "帖子管理" })).toBeVisible();
  await expect(page.getByText(post.title)).toBeVisible();
  await expect(page.getByRole("link", { name: "帖子管理" })).toBeVisible();

  await page.getByRole("button", { name: post.title }).click();
  await expect(page.getByRole("dialog").getByText(post.content)).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "编辑并存入素材库" })
    .click();
  await expect(page.getByRole("dialog").getByText("编辑并存入素材库")).toBeVisible();
  await expect(page.getByLabel("素材标题")).toHaveValue(post.title);
  await expect(page.getByLabel("素材正文")).toHaveValue(post.content);
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();

  const row = page.getByRole("row", { name: new RegExp(post.title) });
  await row.getByRole("button", { name: "删除帖子" }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect.poll(() => deleteBodies.length).toBe(1);
  expect(deleteBodies[0]).toEqual({
    account_id: expect.any(Number),
    tid: post.tid,
    fname: post.fname,
  });
});
