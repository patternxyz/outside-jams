import { describe, expect, it } from "vitest";

import { apiBaseUrl } from "./api-base-url.js";

describe("apiBaseUrl", () => {
  const request = { protocol: "http", get: () => "localhost:5173" };

  it("uses API_BASE_URL when configured", () => {
    expect(apiBaseUrl(request as never, "https://proxy.example.test/path/")).toBe(
      "https://proxy.example.test"
    );
  });

  it("falls back to the current request origin", () => {
    expect(apiBaseUrl(request as never)).toBe("http://localhost:5173");
  });

  it("rejects non-HTTP origins", () => {
    expect(() => apiBaseUrl(request as never, "javascript:alert(1)")).toThrow();
  });
});
