import { describe, expect, it } from "vitest";

import { countCharacters, parseTags } from "@/lib/material-utils";

describe("parseTags", () => {
  it("按逗号、空格和换行拆分并去空", () => {
    expect(parseTags(" 传奇, 资源  ,, 传奇\n推广 ")).toEqual([
      "传奇",
      "资源",
      "推广",
    ]);
  });

  it("忽略大小写重复", () => {
    expect(parseTags("Game, game, GAME")).toEqual(["Game"]);
  });

  it("最多保留 10 个标签", () => {
    const input = Array.from({ length: 15 }, (_, index) => `tag${index}`).join(",");
    expect(parseTags(input)).toHaveLength(10);
  });
});

describe("countCharacters", () => {
  it("按 Unicode 字符计数而不是 UTF-16 单元", () => {
    expect(countCharacters("传奇😀")).toBe(3);
  });
});
