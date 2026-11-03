export interface NeighborPair {
  i: number;
  j: number;
  /** Minimum-image distance in angstrom. */
  distance: number;
}

export interface NeighborList {
  pairs: NeighborPair[];
  cutoff: number;
  /** Number of candidate pairs evaluated (O(N²) reference implementation). */
  evaluated: number;
}
