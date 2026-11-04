import { describe, expect, it } from "vitest";
import {
  createWebGpuKernel,
  LJ_WGSL_SHADER,
  probeWebGpu,
  WebGpuKernelError,
} from "../src/index.js";

describe("WebGPU availability", () => {
  it("reports unavailability instead of pretending to have an adapter", async () => {
    const probe = await probeWebGpu();
    // The Node test environment has no navigator.gpu; a browser with an
    // adapter reports available: true. Both are valid, but the reason must
    // always be populated.
    expect(typeof probe.available).toBe("boolean");
    expect(probe.reason.length).toBeGreaterThan(0);
    if (!probe.available) {
      expect(probe.reason).toMatch(/not exposed|no adapter/i);
    }
  });

  it("throws a typed error when no kernel can be created", async () => {
    const probe = await probeWebGpu();
    if (probe.available) {
      // A real adapter is present; creating a kernel is covered by the browser
      // parity test, not by this Node test.
      return;
    }
    await expect(createWebGpuKernel()).rejects.toBeInstanceOf(WebGpuKernelError);
    await expect(createWebGpuKernel()).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("WebGPU shader integrity", () => {
  it("contains the switched Lennard-Jones operations and the pair counter", () => {
    expect(LJ_WGSL_SHADER).toContain("switchDenom");
    expect(LJ_WGSL_SHADER).toContain("atomicAdd(&pairCount, 1u)");
    expect(LJ_WGSL_SHADER).toContain("round(d.x)");
    expect(LJ_WGSL_SHADER).toContain("24.0 * epsilon");
    expect(LJ_WGSL_SHADER).toContain("0.5 * unswitched * switchValue");
  });

  it("uses one invocation per atom and no floating-point atomics", () => {
    expect(LJ_WGSL_SHADER).toContain("@workgroup_size(64)");
    expect(LJ_WGSL_SHADER).not.toContain("atomicAdd(&forces");
    expect(LJ_WGSL_SHADER).not.toContain("atomic<f32>");
  });
});
