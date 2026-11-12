export type ParsedCookie = {
  bduss: string;
  stoken: string;
};

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

export function parseCookie(raw: string): ParsedCookie {
  const text = raw.trim();
  if (!text) return { bduss: "", stoken: "" };

  let bduss = "";
  let stoken = "";
  const pattern = /(BDUSS|STOKEN)\s*=\s*([^;,\s"'}]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1].toUpperCase();
    const value = stripQuotes(match[2]);
    if (key === "BDUSS") bduss = value;
    else stoken = value;
  }

  if (!bduss && !stoken) {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data && typeof data === "object") {
        if (typeof data.BDUSS === "string") bduss = stripQuotes(data.BDUSS);
        if (typeof data.STOKEN === "string") stoken = stripQuotes(data.STOKEN);
      }
    } catch {
      // 不是 JSON，继续按裸 BDUSS 处理
    }
  }

  if (!bduss && !stoken && !text.includes(";") && !text.includes("\n") && text.length >= 16) {
    bduss = stripQuotes(text);
  }

  return { bduss, stoken };
}
