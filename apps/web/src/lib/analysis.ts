import {
  computeMsd,
  type MdTrajectoryFrame,
  type Structure,
} from "@hcs-materials/core";

export interface MsdSummary {
  lagPs: number[];
  msd: number[];
  slopeAngstrom2PerPs: number;
  diffusionCm2PerS: number;
  fitLagPs: [number, number];
  warnings: string[];
}

/**
 * Converts a frame series with absolute time stamps into mean-square
 * displacement. The frame spacing must be uniform, which the MD scheduler
 * guarantees; a non-uniform series is rejected instead of silently binned.
 */
export function msdFromTrajectory(
  frames: Array<{ step: number; timePs: number; positions: [number, number, number][] }>,
  structure?: Structure,
): MsdSummary | { error: string } {
  if (frames.length < 4) {
    return { error: "At least four trajectory frames are required for a meaningful MSD." };
  }
  const times = frames.map((frame) => frame.timePs);
  const spacing = times[1]! - times[0]!;
  if (!(spacing > 0)) return { error: "Trajectory timestamps are not increasing." };
  for (let i = 2; i < times.length; i++) {
    if (Math.abs(times[i]! - times[i - 1]! - spacing) > spacing * 1e-6) {
      return { error: "Trajectory frame spacing is not uniform." };
    }
  }
  const positions = frames.map((frame) => frame.positions.map((p) => [p[0], p[1], p[2]] as [number, number, number]));
  try {
    const result = computeMsd(positions, { frameTimePs: spacing });
    void structure;
    return {
      lagPs: result.lagPs,
      msd: result.msd,
      slopeAngstrom2PerPs: result.slopeAngstrom2PerPs,
      diffusionCm2PerS: result.diffusionCm2PerS,
      fitLagPs: result.fitLagPs,
      warnings: result.warnings,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export function trajectoryFrameTime(frames: MdTrajectoryFrame[]): number {
  return frames.length > 1 ? frames[1]!.timePs - frames[0]!.timePs : 0;
}
