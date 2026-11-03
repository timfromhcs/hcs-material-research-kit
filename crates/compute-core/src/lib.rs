//! HCS CPU reference kernels.
//!
//! This crate is a second, independent implementation of the same physics as
//! the TypeScript reference engine, used for cross-implementation parity
//! testing and as the foundation for native (Tauri) and WASM builds.
//!
//! Implemented: cubic-switched Lennard-Jones energy and forces with periodic
//! minimum-image boundaries. Nothing else is claimed.
//!
//! Units: energy eV, length Å, force eV/Å.

use serde::{Deserialize, Serialize};

/// Fraction of the cutoff at which the cubic switching window starts.
pub const SWITCH_ON_FRACTION: f64 = 0.9;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Site {
    pub species: String,
    pub fractional_position: [f64; 3],
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Structure {
    /// Row-major lattice vectors in Å.
    pub lattice: [[f64; 3]; 3],
    pub pbc: [bool; 3],
    pub sites: Vec<Site>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PairParameters {
    pub epsilon_ev: f64,
    pub sigma_angstrom: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnergyForces {
    pub energy_ev: f64,
    pub energy_per_atom_ev: f64,
    pub forces: Vec<[f64; 3]>,
    pub max_force: f64,
    pub pair_count: usize,
    pub cutoff: f64,
}

#[derive(Debug, Clone)]
pub struct KernelError(pub String);

impl std::fmt::Display for KernelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for KernelError {}

/// Bare Lennard-Jones pair potential in eV (no switching).
pub fn lj_pair_potential(epsilon: f64, sigma: f64, r: f64) -> f64 {
    let s = sigma / r;
    let s6 = s.powi(6);
    4.0 * epsilon * (s6 * s6 - s6)
}

/// Cubic switching function and its radial derivative.
pub fn switching_function(r: f64, cutoff: f64) -> (f64, f64) {
    let r_on = SWITCH_ON_FRACTION * cutoff;
    if r <= r_on {
        return (1.0, 0.0);
    }
    if r >= cutoff {
        return (0.0, 0.0);
    }
    let r2 = r * r;
    let rc2 = cutoff * cutoff;
    let ron2 = r_on * r_on;
    let a = rc2 - r2;
    let b = rc2 + 2.0 * r2 - 3.0 * ron2;
    let d = (rc2 - ron2).powi(3);
    let s = a * a * b / d;
    let ds = 12.0 * r * a * (ron2 - r2) / d;
    (s, ds)
}

/// Largest cutoff for which the minimum-image convention is unambiguous:
/// half the smallest distance between lattice planes.
pub fn max_cutoff_for_cell(structure: &Structure) -> f64 {
    let [a, b, c] = structure.lattice;
    let volume = det3(a, b, c).abs();
    if volume.is_nan() || volume <= 0.0 {
        return 0.0;
    }
    let areas = [norm(cross(b, c)), norm(cross(c, a)), norm(cross(a, b))];
    let min_spacing = areas
        .iter()
        .map(|area| if *area > 0.0 { volume / area } else { 0.0 })
        .fold(f64::INFINITY, f64::min);
    0.5 * min_spacing
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn det3(a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> f64 {
    dot(a, cross(b, c))
}

fn norm(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}

/// Evaluates the switched Lennard-Jones energy and forces for a single species.
///
/// `requested_cutoff` is clamped to `max_cutoff_for_cell`; the cutoff actually
/// used is returned so callers can record it.
pub fn energy_forces_single_species(
    structure: &Structure,
    params: &PairParameters,
    requested_cutoff: f64,
) -> Result<EnergyForces, KernelError> {
    if structure.sites.is_empty() {
        return Err(KernelError("empty structure".into()));
    }
    if requested_cutoff.is_nan() || requested_cutoff <= 0.0 {
        return Err(KernelError("cutoff must be positive".into()));
    }
    let max_valid = max_cutoff_for_cell(structure);
    if max_valid.is_nan() || max_valid <= 1e-6 {
        return Err(KernelError("cell has no valid minimum-image radius".into()));
    }
    let cutoff = requested_cutoff.min(max_valid);
    if cutoff < 0.9 {
        return Err(KernelError(format!(
            "effective cutoff {cutoff:.3} Å is too small for a meaningful pair sum"
        )));
    }

    let n = structure.sites.len();
    let mut forces = vec![[0.0f64; 3]; n];
    let m = structure.lattice;
    let cutoff2 = cutoff * cutoff;
    let r_on2 = (SWITCH_ON_FRACTION * cutoff).powi(2);
    let rc2 = cutoff2;
    let denominator = (rc2 - r_on2).powi(3);
    let mut energy = 0.0;
    let mut pair_count = 0usize;

    for i in 0..n {
        let fi = structure.sites[i].fractional_position;
        for j in (i + 1)..n {
            let fj = structure.sites[j].fractional_position;
            let mut d = [fj[0] - fi[0], fj[1] - fi[1], fj[2] - fi[2]];
            for (axis, value) in d.iter_mut().enumerate() {
                if structure.pbc[axis] {
                    *value -= value.round();
                }
            }
            let r_vec = [
                d[0] * m[0][0] + d[1] * m[1][0] + d[2] * m[2][0],
                d[0] * m[0][1] + d[1] * m[1][1] + d[2] * m[2][1],
                d[0] * m[0][2] + d[1] * m[1][2] + d[2] * m[2][2],
            ];
            let r2 = dot(r_vec, r_vec);
            if r2 > cutoff2 || r2 == 0.0 {
                continue;
            }
            pair_count += 1;

            let inv_r2 = 1.0 / r2;
            let s2 = params.sigma_angstrom * params.sigma_angstrom * inv_r2;
            let s6 = s2 * s2 * s2;
            let s12 = s6 * s6;
            let unswitched = 4.0 * params.epsilon_ev * (s12 - s6);
            let f_scalar = 24.0 * params.epsilon_ev * (s6 - 2.0 * s12) * inv_r2;

            let (switch_value, factor) = if r2 <= r_on2 {
                (1.0, f_scalar)
            } else {
                let a = rc2 - r2;
                let b = rc2 + 2.0 * r2 - 3.0 * r_on2;
                let s = a * a * b / denominator;
                let ds_over_r = 12.0 * a * (r_on2 - r2) / denominator;
                (s, f_scalar * s + unswitched * ds_over_r)
            };

            energy += unswitched * switch_value;
            let force = [factor * r_vec[0], factor * r_vec[1], factor * r_vec[2]];
            for axis in 0..3 {
                forces[i][axis] += force[axis];
                forces[j][axis] -= force[axis];
            }
        }
    }

    let max_force = forces.iter().map(|f| norm(*f)).fold(0.0f64, f64::max);

    Ok(EnergyForces {
        energy_ev: energy,
        energy_per_atom_ev: energy / n as f64,
        forces,
        max_force,
        pair_count,
        cutoff,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct FixtureModel {
        cutoff: f64,
        epsilon_ev: f64,
        sigma_angstrom: f64,
        switch_on_fraction: f64,
    }

    #[derive(Deserialize)]
    struct FixtureExpected {
        energy_ev: f64,
        energy_per_atom_ev: f64,
        max_force_ev_per_angstrom: f64,
        pair_count: usize,
        cutoff_used: f64,
        forces: Vec<[f64; 3]>,
    }

    #[derive(Deserialize)]
    struct Fixture {
        model: FixtureModel,
        structure: Structure,
        expected: FixtureExpected,
    }

    fn fixture() -> Fixture {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/fixtures/reference/lj-argon-32.json"
        );
        let text = std::fs::read_to_string(path).expect("reference fixture must exist");
        serde_json::from_str(&text).expect("reference fixture must parse")
    }

    #[test]
    fn pair_potential_matches_closed_form() {
        let sigma = 3.405;
        let epsilon = 0.01032;
        let r_min = 2f64.powf(1.0 / 6.0) * sigma;
        assert!((lj_pair_potential(epsilon, sigma, r_min) + epsilon).abs() < 1e-15);
        assert!(lj_pair_potential(1.0, 1.0, 0.5) > 1000.0);
    }

    #[test]
    fn switching_is_continuous_and_bounded() {
        let cutoff = 7.0;
        let r_on = SWITCH_ON_FRACTION * cutoff;
        for r in [0.5, r_on - 1e-9, r_on, 6.5, 6.99, cutoff, 7.5] {
            let (s, _) = switching_function(r, cutoff);
            assert!((0.0..=1.0).contains(&s), "S(r) out of range at r={r}: {s}");
        }
        let (s_on, _) = switching_function(r_on, cutoff);
        assert!((s_on - 1.0).abs() < 1e-12);
        let (s_cut, _) = switching_function(cutoff, cutoff);
        assert_eq!(s_cut, 0.0);
    }

    #[test]
    fn matches_typescript_reference_within_1e_10() {
        let fixture = fixture();
        assert_eq!(fixture.model.switch_on_fraction, SWITCH_ON_FRACTION);
        let params = PairParameters {
            epsilon_ev: fixture.model.epsilon_ev,
            sigma_angstrom: fixture.model.sigma_angstrom,
        };
        let result =
            energy_forces_single_species(&fixture.structure, &params, fixture.model.cutoff)
                .expect("kernel must run");

        assert!(
            (result.energy_ev - fixture.expected.energy_ev).abs() < 1e-10,
            "energy mismatch: {} vs {}",
            result.energy_ev,
            fixture.expected.energy_ev
        );
        assert!(
            (result.energy_per_atom_ev - fixture.expected.energy_per_atom_ev).abs() < 1e-10,
            "energy per atom mismatch"
        );
        assert!(
            (result.cutoff - fixture.expected.cutoff_used).abs() < 1e-12,
            "cutoff mismatch"
        );
        assert_eq!(result.pair_count, fixture.expected.pair_count);
        assert!(
            (result.max_force - fixture.expected.max_force_ev_per_angstrom).abs() < 1e-10,
            "max force mismatch"
        );
        for (index, (a, b)) in result
            .forces
            .iter()
            .zip(fixture.expected.forces.iter())
            .enumerate()
        {
            for axis in 0..3 {
                assert!(
                    (a[axis] - b[axis]).abs() < 1e-10,
                    "force mismatch at atom {index} axis {axis}: {} vs {}",
                    a[axis],
                    b[axis]
                );
            }
        }
    }

    #[test]
    fn net_force_vanishes_in_a_periodic_cell() {
        let fixture = fixture();
        let params = PairParameters {
            epsilon_ev: fixture.model.epsilon_ev,
            sigma_angstrom: fixture.model.sigma_angstrom,
        };
        let result =
            energy_forces_single_species(&fixture.structure, &params, fixture.model.cutoff)
                .unwrap();
        let mut total = [0.0f64; 3];
        for f in &result.forces {
            for axis in 0..3 {
                total[axis] += f[axis];
            }
        }
        assert!(norm(total) < 1e-9, "net force must vanish, got {total:?}");
    }

    #[test]
    fn rejects_a_cell_that_is_too_small() {
        let structure = Structure {
            lattice: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            pbc: [true, true, true],
            sites: vec![
                Site {
                    species: "Ar".into(),
                    fractional_position: [0.0, 0.0, 0.0],
                },
                Site {
                    species: "Ar".into(),
                    fractional_position: [0.5, 0.5, 0.5],
                },
            ],
        };
        let params = PairParameters {
            epsilon_ev: 0.01032,
            sigma_angstrom: 3.405,
        };
        assert!(energy_forces_single_species(&structure, &params, 8.5).is_err());
    }
}
