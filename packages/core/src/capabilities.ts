/**
 * Hardware / backend capability report.
 *
 * Probes what the runtime actually exposes. It never infers GPU support from a
 * marketing name, and it never reports a backend as usable when the probe
 * failed. CPU is always available and remains the correctness reference.
 */

export interface WebGpuProbe {
  available: boolean;
  reason: string;
  vendor?: string;
  architecture?: string;
  description?: string;
  maxBufferSize?: number;
  maxComputeWorkgroupSizeX?: number;
}

export interface StorageProbe {
  supported: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  persisted?: boolean;
}

export interface HardwareReport {
  platform: "browser" | "node";
  userAgent?: string;
  os: string;
  architecture: string;
  cpuThreads: number;
  deviceMemoryGb?: number;
  wasm: { available: boolean; simd: boolean; threads: boolean };
  webgpu: WebGpuProbe;
  storage: StorageProbe;
  /** Backend chosen for HCS kernels, with the reason recorded. */
  selectedBackend: "cpu" | "webgpu" | "wasm";
  selectionReasons: string[];
  probedAt: string;
}

interface GpuLike {
  requestAdapter: (options?: { powerPreference?: string }) => Promise<GpuAdapterLike | null>;
}

interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string; description?: string };
  limits?: { maxBufferSize?: number; maxComputeWorkgroupSizeX?: number };
  features?: Set<string>;
}

export async function detectHardware(): Promise<HardwareReport> {
  const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
  const reasons: string[] = [];
  const report: HardwareReport = {
    platform: isBrowser ? "browser" : "node",
    os: isBrowser ? navigator.platform || "unknown" : nodePlatform(),
    architecture: isBrowser ? "unknown" : nodeArchitecture(),
    cpuThreads: isBrowser
      ? navigator.hardwareConcurrency || 1
      : nodeThreads(),
    wasm: { available: false, simd: false, threads: false },
    webgpu: { available: false, reason: "not probed" },
    storage: { supported: false },
    selectedBackend: "cpu",
    selectionReasons: reasons,
    probedAt: new Date().toISOString(),
  };

  // WebAssembly feature probes.
  if (typeof WebAssembly !== "undefined") {
    report.wasm.available = true;
    try {
      // SIMD: a module using v128 instructions fails to validate without support.
      const simd = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
        0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62,
        0x0b,
      ]);
      report.wasm.simd = WebAssembly.validate(simd);
    } catch {
      report.wasm.simd = false;
    }
    report.wasm.threads =
      typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined";
  } else {
    reasons.push("WebAssembly is unavailable in this runtime.");
  }

  // WebGPU probe (browser only).
  if (isBrowser) {
    const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu;
    if (!gpu) {
      report.webgpu = {
        available: false,
        reason: "navigator.gpu is not exposed by this browser (WebGPU unsupported or disabled).",
      };
      reasons.push("No WebGPU: using the CPU/WebAssembly reference path.");
    } else {
      try {
        const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
          report.webgpu = {
            available: false,
            reason: "navigator.gpu exists but no adapter was returned (driver or permission issue).",
          };
          reasons.push("WebGPU adapter unavailable: using CPU/WebAssembly.");
        } else {
          report.webgpu = {
            available: true,
            reason: "Adapter acquired.",
            vendor: adapter.info?.vendor,
            architecture: adapter.info?.architecture,
            description: adapter.info?.description,
            maxBufferSize: adapter.limits?.maxBufferSize,
            maxComputeWorkgroupSizeX: adapter.limits?.maxComputeWorkgroupSizeX,
          };
          reasons.push(
            "WebGPU adapter present, but no HCS kernel has a validated WebGPU implementation yet; " +
              "kernels run on the CPU/WebAssembly reference path.",
          );
        }
      } catch (error) {
        report.webgpu = {
          available: false,
          reason: `WebGPU probe threw: ${error instanceof Error ? error.message : String(error)}`,
        };
        reasons.push("WebGPU probe failed: using CPU/WebAssembly.");
      }
    }

    if (typeof navigator.storage?.estimate === "function") {
      try {
        const estimate = await navigator.storage.estimate();
        report.storage = {
          supported: true,
          quotaBytes: estimate.quota,
          usageBytes: estimate.usage,
        };
        if (typeof navigator.storage.persisted === "function") {
          report.storage.persisted = await navigator.storage.persisted();
        }
        reasons.push(
          "Browser storage is origin-private and may be evicted; export .hcsproj archives to keep results.",
        );
      } catch {
        report.storage = { supported: false };
      }
    }

    const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof deviceMemory === "number") report.deviceMemoryGb = deviceMemory;
    report.userAgent = navigator.userAgent;
  } else {
    report.webgpu = {
      available: false,
      reason: "Native WebGPU/Vulkan kernel not built into this Node build; CPU reference path is used.",
    };
    reasons.push("Native CPU implementation selected (float64 reference path).");
  }

  return report;
}

/**
 * Node globals are read through `globalThis` so this module stays bundleable
 * for the browser without externalising `node:os`.
 */
interface NodeLikeProcess {
  platform?: string;
  arch?: string;
  availableParallelism?: () => number;
  memoryUsage?: () => { rss: number };
}

function nodeProcess(): NodeLikeProcess | undefined {
  const candidate = (globalThis as { process?: NodeLikeProcess }).process;
  return candidate && typeof candidate === "object" ? candidate : undefined;
}

function nodePlatform(): string {
  return nodeProcess()?.platform ?? "unknown";
}

function nodeArchitecture(): string {
  return nodeProcess()?.arch ?? "unknown";
}

function nodeThreads(): number {
  const threads = nodeProcess()?.availableParallelism?.();
  return typeof threads === "number" && threads > 0 ? threads : 1;
}

/** Human-readable one-liner used in the status bar. */
export function describeBackend(report: HardwareReport): string {
  const backend = report.selectedBackend.toUpperCase();
  const wasm = report.wasm.available ? `WASM${report.wasm.simd ? "+SIMD" : ""}` : "no WASM";
  const gpu = report.webgpu.available ? "WebGPU adapter present" : "no WebGPU";
  return `${backend} · ${wasm} · ${gpu} · ${report.cpuThreads} threads`;
}
