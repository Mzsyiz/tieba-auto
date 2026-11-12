import { describe, expect, it } from "vitest";

import { chunk, unfollowedSelectedIds } from "@/lib/forum-selection";

describe("forum selection", () => {
  it("只保留当前账号尚未关注的贴吧", () => {
    const selected = Array.from({ length: 48 }, (_, index) => index + 1);
    const items = selected.map((id) => ({
      id,
      followed_by_account: id <= 46,
    }));
    expect(unfollowedSelectedIds(selected, items)).toEqual([47, 48]);
  });

  it("按 8 个一批拆分 48 个贴吧", () => {
    const ids = Array.from({ length: 48 }, (_, index) => index + 1);
    const batches = chunk(ids, 8);
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 8, 8, 8, 8]);
    expect(batches.flat()).toHaveLength(48);
  });

  it("空选择返回空数组", () => {
    expect(unfollowedSelectedIds([], [])).toEqual([]);
    expect(chunk([], 8)).toEqual([]);
  });
});
