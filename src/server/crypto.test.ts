import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./crypto";

describe("password hashing", () => {
  it("verifies correct password", async () => {
    const h = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", h)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const h = await hashPassword("s3cret");
    expect(await verifyPassword("nope", h)).toBe(false);
  });

  it("produces unique salts", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
});
