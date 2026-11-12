import { describe, expect, it } from "vitest";

import { parseCookie } from "@/lib/cookie";

describe("parseCookie", () => {
  it("从完整 Cookie 中提取 BDUSS 和 STOKEN", () => {
    const parsed = parseCookie("BAIDUID=abc; BDUSS=bduss-value; STOKEN=stoken-value; X=1");
    expect(parsed.bduss).toBe("bduss-value");
    expect(parsed.stoken).toBe("stoken-value");
  });

  it("支持 JSON 对象", () => {
    const parsed = parseCookie('{"BDUSS":"json-bduss","STOKEN":"json-stoken"}');
    expect(parsed.bduss).toBe("json-bduss");
    expect(parsed.stoken).toBe("json-stoken");
  });

  it("支持裸 BDUSS", () => {
    const bare = "a".repeat(32);
    expect(parseCookie(bare).bduss).toBe(bare);
  });

  it("空值返回空结果", () => {
    expect(parseCookie("")).toEqual({ bduss: "", stoken: "" });
  });
});
