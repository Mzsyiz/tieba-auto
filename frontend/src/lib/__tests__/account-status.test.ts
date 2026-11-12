import { describe, expect, it } from "vitest";

import { STATUS_LABELS, STATUS_ORDER } from "@/lib/account-status";

describe("account status", () => {
  it("覆盖全部四种状态", () => {
    expect(STATUS_ORDER).toEqual(["valid", "pending", "invalid", "disabled"]);
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(
      ["valid", "pending", "invalid", "disabled"].sort()
    );
  });

  it("提供中文标签", () => {
    expect(STATUS_LABELS.valid).toBe("正常");
    expect(STATUS_LABELS.pending).toBe("待验证");
    expect(STATUS_LABELS.invalid).toBe("失效");
    expect(STATUS_LABELS.disabled).toBe("已停用");
  });
});
