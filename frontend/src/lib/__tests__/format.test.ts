import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/format";

describe("formatDateTime", () => {
  it("空值返回占位符", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
  });

  it("无效日期返回占位符", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });

  it("格式化 ISO 日期", () => {
    expect(formatDateTime("2026-11-10T17:49:06+08:00")).toContain("2026");
  });
});
