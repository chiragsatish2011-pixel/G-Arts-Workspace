import { describe, expect, it } from "vitest";
import { httpsUrl } from "./verified-links.js";

describe("verified evidence links", () => {
  it("accepts an HTTPS link", () => expect(httpsUrl.safeParse("https://gurukul.org/events/").success).toBe(true));
  it("rejects insecure and executable schemes", () => {
    expect(httpsUrl.safeParse("http://gurukul.org/events/").success).toBe(false);
    expect(httpsUrl.safeParse("javascript:alert(1)").success).toBe(false);
  });
});
