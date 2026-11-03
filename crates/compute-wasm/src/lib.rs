//! WebAssembly bindings for the HCS CPU reference kernel.
//!
//! Deliberately a plain C ABI with linear-memory buffers instead of
//! `wasm-bindgen`: the surface is one function, it has no runtime glue, and the
//! same bytes work in the browser, in a worker and in Node for parity tests.
//!
//! Memory contract for `hcs_lj_energy_forces`:
//! * every pointer refers to the module's own linear memory;
//! * `lattice` has 9 f64 (row-major a, b, c in Å);
//! * `pbc` has 3 bytes (0/1);
//! * `frac` has 3n f64 fractional coordinates;
//! * `eps` and `sigma` have n f64 each (per-site, mixing is applied inside);
//! * `out_forces` has 3n f64;
//! * `out_scalars` has 5 f64:
//!   [energy_eV, energy_per_atom_eV, max_force_eV_per_A, cutoff_used_A, pair_count]
//!
//! Return codes: 0 ok, 1 invalid argument/memory, 2 kernel rejected the input
//! (empty structure, bad parameters, cutoff, or cell too small).

use hcs_compute_core::{energy_forces_with_site_params, PairParameters, Site, Structure};
use std::slice;

/// Allocates `len` bytes in the module's linear memory. The caller owns them
/// and must call [`hcs_free`] with the same length.
#[no_mangle]
pub extern "C" fn hcs_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return std::ptr::null_mut();
    }
    let mut buffer = Vec::<u8>::with_capacity(len);
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

/// Frees a buffer previously returned by [`hcs_alloc`].
///
/// # Safety
/// `pointer` must come from `hcs_alloc(len)` and must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn hcs_free(pointer: *mut u8, len: usize) {
    if pointer.is_null() || len == 0 {
        return;
    }
    drop(Vec::from_raw_parts(pointer, 0, len));
}

/// Evaluates the switched Lennard-Jones energy and forces.
///
/// # Safety
/// All pointers must point to valid buffers of the documented length inside
/// this module's linear memory, and must not overlap the output buffers.
#[no_mangle]
pub unsafe extern "C" fn hcs_lj_energy_forces(
    n: u32,
    lattice: *const f64,
    pbc: *const u8,
    frac: *const f64,
    eps: *const f64,
    sigma: *const f64,
    cutoff: f64,
    out_forces: *mut f64,
    out_scalars: *mut f64,
) -> i32 {
    if n == 0 || n > 200_000 {
        return 1;
    }
    if lattice.is_null()
        || pbc.is_null()
        || frac.is_null()
        || eps.is_null()
        || sigma.is_null()
        || out_forces.is_null()
        || out_scalars.is_null()
    {
        return 1;
    }

    let count = n as usize;
    let lattice_slice = slice::from_raw_parts(lattice, 9);
    let pbc_slice = slice::from_raw_parts(pbc, 3);
    let frac_slice = slice::from_raw_parts(frac, count * 3);
    let eps_slice = slice::from_raw_parts(eps, count);
    let sigma_slice = slice::from_raw_parts(sigma, count);

    let mut sites = Vec::with_capacity(count);
    let mut site_params = Vec::with_capacity(count);
    for index in 0..count {
        sites.push(Site {
            species: "X".to_string(),
            fractional_position: [
                frac_slice[index * 3],
                frac_slice[index * 3 + 1],
                frac_slice[index * 3 + 2],
            ],
        });
        site_params.push(PairParameters {
            epsilon_ev: eps_slice[index],
            sigma_angstrom: sigma_slice[index],
        });
    }

    let structure = Structure {
        lattice: [
            [lattice_slice[0], lattice_slice[1], lattice_slice[2]],
            [lattice_slice[3], lattice_slice[4], lattice_slice[5]],
            [lattice_slice[6], lattice_slice[7], lattice_slice[8]],
        ],
        pbc: [pbc_slice[0] != 0, pbc_slice[1] != 0, pbc_slice[2] != 0],
        sites,
    };

    match energy_forces_with_site_params(&structure, &site_params, cutoff) {
        Ok(result) => {
            let forces = slice::from_raw_parts_mut(out_forces, count * 3);
            for (index, force) in result.forces.iter().enumerate() {
                forces[index * 3] = force[0];
                forces[index * 3 + 1] = force[1];
                forces[index * 3 + 2] = force[2];
            }
            let scalars = slice::from_raw_parts_mut(out_scalars, 5);
            scalars[0] = result.energy_ev;
            scalars[1] = result.energy_per_atom_ev;
            scalars[2] = result.max_force;
            scalars[3] = result.cutoff;
            scalars[4] = result.pair_count as f64;
            0
        }
        Err(_) => 2,
    }
}

/// ABI version, so a stale asset can be detected instead of silently mismatched.
#[no_mangle]
pub extern "C" fn hcs_abi_version() -> u32 {
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alloc_returns_writable_memory() {
        let pointer = hcs_alloc(64);
        assert!(!pointer.is_null());
        unsafe {
            slice::from_raw_parts_mut(pointer, 64).fill(7);
            hcs_free(pointer, 64);
        }
    }

    #[test]
    fn rejects_invalid_arguments() {
        let mut forces = [0.0f64; 3];
        let mut scalars = [0.0f64; 5];
        unsafe {
            assert_eq!(
                hcs_lj_energy_forces(
                    0,
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    std::ptr::null(),
                    8.5,
                    forces.as_mut_ptr(),
                    scalars.as_mut_ptr()
                ),
                1
            );
        }
    }

    #[test]
    fn computes_a_two_atom_energy() {
        // Two argon atoms 3.8 Å apart in a 20 Å cubic cell.
        let lattice = [20.0, 0.0, 0.0, 0.0, 20.0, 0.0, 0.0, 0.0, 20.0];
        let pbc = [1u8, 1, 1];
        let frac = [0.5, 0.5, 0.5, 0.5 + 3.8 / 20.0, 0.5, 0.5];
        let eps = [0.01032f64, 0.01032];
        let sigma = [3.405f64, 3.405];
        let mut forces = [0.0f64; 6];
        let mut scalars = [0.0f64; 5];
        let status = unsafe {
            hcs_lj_energy_forces(
                2,
                lattice.as_ptr(),
                pbc.as_ptr(),
                frac.as_ptr(),
                eps.as_ptr(),
                sigma.as_ptr(),
                10.0,
                forces.as_mut_ptr(),
                scalars.as_mut_ptr(),
            )
        };
        assert_eq!(status, 0);
        assert!(
            scalars[0] < 0.0,
            "attractive well expected, got {}",
            scalars[0]
        );
        assert!(scalars[2] > 0.0, "non-zero force expected");
        assert_eq!(scalars[4] as usize, 1);
        // Newton's third law: net force vanishes.
        for axis in 0..3 {
            assert!((forces[axis] + forces[3 + axis]).abs() < 1e-12);
        }
    }
}
