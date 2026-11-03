import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "@hcs-materials/core";

describe("sha256", () => {
  it("matches published test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  it("handles inputs across block boundaries", () => {
    // 56 bytes forces an extra padding block; 64 bytes is exactly one block.
    const a = "a".repeat(55);
    const b = "a".repeat(56);
    const c = "a".repeat(64);
    expect(sha256Hex(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Hex(b)).not.toBe(sha256Hex(a));
    expect(sha256Hex(c)).toMatch(/^[a-f0-9]{64}$/);
    expect(new Set([sha256Hex(a), sha256Hex(b), sha256Hex(c)]).size).toBe(3);
  });
});

describe("canonicalJson", () => {
  it("is independent of object key order", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  it("preserves array order", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("rejects non-finite numbers instead of hashing NaN", () => {
    expect(() => canonicalJson({ x: NaN })).toThrow(/non-finite/);
    expect(() => canonicalJson({ x: Infinity })).toThrow(/non-finite/);
  });

  it("rejects cyclic structures", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cyclic/);
  });
});
