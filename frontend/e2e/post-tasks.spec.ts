import { expect, test } from "@playwright/test";

test("发帖任务可组合账号、贴吧、素材并提交创建启动", async ({ page, request }) => {
  const suffix = Date.now();
  const materialTitle = `e2e发帖素材${suffix}`;
  const materialResponse = await request.post("/api/v1/materials", {
    data: {
      title: materialTitle,
      content: "用于发帖任务端到端测试的正文。",
      tags: ["e2e"],
    },
  });
  expect(materialResponse.ok()).toBeTruthy();
  const material = (await materialResponse.json()) as { id: number };

  try {
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "发帖任务" })).toBeVisible();
    await page.getByRole("button", { name: "新建任务" }).click();
    await expect(page.getByRole("dialog").getByText("新建发帖任务")).toBeVisible();

    const manualForumCount = await page.getByLabel(/^选择发帖贴吧-/).count();
    const accountCheckboxes = page.getByLabel(/^选择发帖账号-/);
    const accountCount = await accountCheckboxes.count();
    let accountCheckbox = accountCheckboxes.first();
    for (let index = 0; index < accountCount; index += 1) {
      const candidate = accountCheckboxes.nth(index);
      if (await candidate.isEnabled()) {
        accountCheckbox = candidate;
        break;
      }
    }
    const accountLabel = (await accountCheckbox.getAttribute("aria-label")) ?? "";
    await page.getByLabel("搜索账号").fill(accountLabel.replace("选择发帖账号-", ""));
    await expect(accountCheckboxes).toHaveCount(1);
    await accountCheckbox.click();
    await expect
      .poll(() => page.getByLabel(/^选择发帖贴吧-/).count())
      .toBeGreaterThan(manualForumCount);

    const forumCheckbox = page.getByLabel(/^选择发帖贴吧-/).first();
    const forumLabel = (await forumCheckbox.getAttribute("aria-label")) ?? "";
    await page.getByLabel("搜索贴吧").fill(forumLabel.replace("选择发帖贴吧-", ""));
    await expect(page.getByLabel(/^选择发帖贴吧-/)).toHaveCount(1);
    await forumCheckbox.click();

    await page.getByLabel("搜索素材").fill(materialTitle);
    await expect(page.getByLabel(/^选择发帖素材-/)).toHaveCount(1);
    const materialCheckbox = page.getByLabel(`选择发帖素材-${materialTitle}`);
    await materialCheckbox.click();
    await expect(materialCheckbox).toHaveAttribute("aria-checked", "true");

    const createBodies: Array<{
      account_ids: number[];
      forum_ids: number[];
      material_ids: number[];
    }> = [];
    const startBodies: Array<unknown> = [];
    let fakeTask: Record<string, unknown> | null = null;

    await page.route("**/api/v1/post-tasks", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as {
        name: string | null;
        account_ids: number[];
        forum_ids: number[];
        material_ids: number[];
        interval_min: number;
        interval_max: number;
        scheduled_at: string | null;
      };
      createBodies.push(body);
      const now = new Date().toISOString();
      fakeTask = {
        id: 9999,
        name: body.name || "e2e发帖任务",
        account_ids: body.account_ids,
        forum_ids: body.forum_ids,
        material_ids: body.material_ids,
        strategy: "round_robin",
        interval_min: body.interval_min,
        interval_max: body.interval_max,
        scheduled_at: body.scheduled_at,
        status: "pending",
        total: body.account_ids.length * body.forum_ids.length,
        completed: 0,
        success: 0,
        failed: 0,
        started_at: null,
        finished_at: null,
        last_error: null,
        created_at: now,
        updated_at: now,
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(fakeTask),
      });
    });

    await page.route("**/api/v1/post-tasks/*/start", async (route) => {
      startBodies.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...(fakeTask ?? {}), status: "running" }),
      });
    });

    await page.getByRole("button", { name: "创建并开始" }).click();
    await expect.poll(() => createBodies.length).toBeGreaterThan(0);
    await expect.poll(() => startBodies.length).toBeGreaterThan(0);

    expect(createBodies[0].account_ids.length).toBeGreaterThan(0);
    expect(createBodies[0].forum_ids.length).toBeGreaterThan(0);
    expect(createBodies[0].material_ids).toContain(material.id);
  } finally {
    await request.delete(`/api/v1/materials/${material.id}`);
  }
});

test("待执行任务可编辑，并能复制后继续修改", async ({ page, request }) => {
  const suffix = Date.now();
  const originalName = `e2e可编辑任务${suffix}`;
  const editedName = `${originalName}-改`;

  const materialResponse = await request.post("/api/v1/materials", {
    data: {
      title: `e2e编辑素材${suffix}`,
      content: "用于编辑发帖任务测试的正文。",
    },
  });
  expect(materialResponse.ok()).toBeTruthy();
  const material = (await materialResponse.json()) as { id: number };

  const accountsResponse = await request.get("/api/v1/accounts");
  const accounts = (await accountsResponse.json()) as Array<{
    id: number;
    status: string;
    has_credentials: boolean;
  }>;
  const account =
    accounts.find((item) => item.status === "valid" && item.has_credentials) ??
    accounts[0];
  const forumsResponse = await request.get("/api/v1/forums");
  const forums = (await forumsResponse.json()) as {
    items: Array<{ id: number }>;
  };
  const taskResponse = await request.post("/api/v1/post-tasks", {
    data: {
      name: originalName,
      account_ids: [account.id],
      forum_ids: [forums.items[0].id],
      material_ids: [material.id],
      interval_min: 0,
      interval_max: 0,
    },
  });
  expect(taskResponse.ok()).toBeTruthy();

  try {
    await page.goto("/posts");
    await expect(page.getByRole("heading", { name: "发帖任务" })).toBeVisible();

    let row = page.getByRole("row", { name: new RegExp(originalName) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "编辑" }).click();
    await expect(page.getByRole("dialog").getByText("编辑发帖任务")).toBeVisible();
    await page.getByLabel("任务名称").fill(editedName);
    await page.getByRole("button", { name: "保存修改" }).click();

    row = page.getByRole("row", { name: new RegExp(editedName) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "复制" }).click();
    await expect(page.getByRole("dialog").getByText("编辑发帖任务")).toBeVisible();
    await expect(page.getByLabel("任务名称")).toHaveValue(`${editedName}（副本）`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "取消" })
      .click();

    await expect(
      page.getByRole("row", { name: new RegExp(`${editedName}（副本）`) })
    ).toBeVisible();
  } finally {
    const tasksResponse = await request.get("/api/v1/post-tasks");
    const tasks = (await tasksResponse.json()) as {
      items: Array<{ id: number; name: string }>;
    };
    for (const task of tasks.items) {
      if (task.name.startsWith(`e2e可编辑任务${suffix}`)) {
        await request.delete(`/api/v1/post-tasks/${task.id}`);
      }
    }
    await request.delete(`/api/v1/materials/${material.id}`);
  }
});
