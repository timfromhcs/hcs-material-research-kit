"""Structure model, periodic cell mathematics and validation.

Units are angstrom; fractional coordinates are in the lattice basis. This is a
compatible implementation of the same contract as @hcs-materials/core, kept in
sync by cross-language fixtures (tests/test_cross_language.py).
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Literal, Sequence

Vec3 = tuple[float, float, float]
Mat3 = tuple[Vec3, Vec3, Vec3]

SCHEMA_VERSION = "1.0.0"
OVERLAP_THRESHOLD_ANGSTROM = 0.5

# Approximate standard atomic weights (u) — same table family as the TypeScript
# core; used for density and MD mass assignment only.
ATOMIC_MASS: dict[str, float] = {
    "H": 1.008, "He": 4.0026, "Li": 6.94, "Be": 9.0122, "B": 10.81, "C": 12.011,
    "N": 14.007, "O": 15.999, "F": 18.998, "Ne": 20.18, "Na": 22.99, "Mg": 24.305,
    "Al": 26.982, "Si": 28.085, "P": 30.974, "S": 32.06, "Cl": 35.45, "Ar": 39.948,
    "K": 39.098, "Ca": 40.078, "Sc": 44.956, "Ti": 47.867, "V": 50.942, "Cr": 51.996,
    "Mn": 54.938, "Fe": 55.845, "Co": 58.933, "Ni": 58.693, "Cu": 63.546, "Zn": 65.38,
    "Ga": 69.723, "Ge": 72.63, "As": 74.922, "Se": 78.971, "Br": 79.904, "Kr": 83.798,
    "Rb": 85.468, "Sr": 87.62, "Y": 88.906, "Zr": 91.224, "Nb": 92.906, "Mo": 95.95,
    "Tc": 98.0, "Ru": 101.07, "Rh": 102.91, "Pd": 106.42, "Ag": 107.87, "Cd": 112.41,
    "In": 114.82, "Sn": 118.71, "Sb": 121.76, "Te": 127.6, "I": 126.9, "Xe": 131.29,
    "Cs": 132.91, "Ba": 137.33, "La": 138.91, "Ce": 140.12, "Pr": 140.91, "Nd": 144.24,
    "Pm": 145.0, "Sm": 150.36, "Eu": 151.96, "Gd": 157.25, "Tb": 158.93, "Dy": 162.5,
    "Ho": 164.93, "Er": 167.26, "Tm": 168.93, "Yb": 173.05, "Lu": 174.97, "Hf": 178.49,
    "Ta": 180.95, "W": 183.84, "Re": 186.21, "Os": 190.23, "Ir": 192.22, "Pt": 195.08,
    "Au": 196.97, "Hg": 200.59, "Tl": 204.38, "Pb": 207.2, "Bi": 208.98, "Po": 209.0,
    "At": 210.0, "Rn": 222.0, "Fr": 223.0, "Ra": 226.0, "Ac": 227.0, "Th": 232.04,
    "Pa": 231.04, "U": 238.03, "Np": 237.0, "Pu": 244.0, "Am": 243.0, "Cm": 247.0,
}

# Pauling electronegativity, used only for conventional formula ordering.
ELECTRONEGATIVITY: dict[str, float] = {
    "H": 2.2, "Li": 0.98, "Be": 1.57, "B": 2.04, "C": 2.55, "N": 3.04, "O": 3.44,
    "F": 3.98, "Na": 0.93, "Mg": 1.31, "Al": 1.61, "Si": 1.9, "P": 2.19, "S": 2.58,
    "Cl": 3.16, "K": 0.82, "Ca": 1.0, "Sc": 1.36, "Ti": 1.54, "V": 1.63, "Cr": 1.66,
    "Mn": 1.55, "Fe": 1.83, "Co": 1.88, "Ni": 1.91, "Cu": 1.9, "Zn": 1.65, "Ga": 1.81,
    "Ge": 2.01, "As": 2.18, "Se": 2.55, "Br": 2.96, "Rb": 0.82, "Sr": 0.95, "Y": 1.22,
    "Zr": 1.33, "Nb": 1.6, "Mo": 2.16, "Ru": 2.2, "Rh": 2.28, "Pd": 2.2, "Ag": 1.93,
    "Cd": 1.69, "In": 1.78, "Sn": 1.96, "Sb": 2.05, "Te": 2.1, "I": 2.66, "Cs": 0.79,
    "Ba": 0.89, "La": 1.1, "Ce": 1.12, "W": 2.36, "Pt": 2.28, "Au": 2.54, "Hg": 2.0,
    "Pb": 2.33, "Bi": 2.02, "U": 1.38,
}

BASE_SYMBOL_RE = __import__("re").compile(r"^([A-Z][a-z]?)")


def base_symbol(species: str) -> str:
    match = BASE_SYMBOL_RE.match(species)
    return match.group(1) if match else species


@dataclass
class Site:
    species: str
    fractional_position: Vec3
    label: str | None = None
    occupancy: float = 1.0
    mobility: tuple[bool, bool, bool] | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "species": base_symbol(self.species),
            "fractional_position": list(self.fractional_position),
            "occupancy": self.occupancy,
        }
        if self.label:
            data["label"] = self.label
        if self.mobility is not None:
            data["mobility"] = list(self.mobility)
        return data


@dataclass
class Structure:
    structure_id: str
    lattice: Mat3
    sites: list[Site]
    pbc: tuple[bool, bool, bool] = (True, True, True)
    length_unit: str = "angstrom"
    display_name: str | None = None
    space_group_symbol: str | None = None
    source: dict[str, Any] | None = None
    schema_version: str = SCHEMA_VERSION

    # -- to_dict ---------------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        composition = composition_of(self.sites)
        data: dict[str, Any] = {
            "schema_version": self.schema_version,
            "structure_id": self.structure_id,
            "length_unit": self.length_unit,
            "lattice": {"vectors": [list(row) for row in self.lattice]},
            "pbc": list(self.pbc),
            "sites": [site.to_dict() for site in self.sites],
            "composition": composition,
        }
        if self.display_name:
            data["display_name"] = self.display_name
        if self.space_group_symbol:
            data["space_group"] = {"symbol": self.space_group_symbol}
        if self.source:
            data["source"] = self.source
        return data

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, sort_keys=False) + "\n"


@dataclass
class ValidationCheck:
    id: str
    status: Literal["pass", "warning", "fail"]
    message: str


@dataclass
class ValidationReport:
    status: Literal["valid", "warning", "invalid"]
    checks: list[ValidationCheck] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "checks": [
                {"id": c.id, "status": c.status, "message": c.message} for c in self.checks
            ],
        }


def lattice_vectors(structure: Structure) -> Mat3:
    if structure.length_unit != "angstrom":
        factor = {"nanometer": 10.0, "bohr": 0.529177210903}[structure.length_unit]
        return tuple(
            tuple(x * factor for x in row) for row in structure.lattice
        )  # type: ignore[return-value]
    return structure.lattice


def det3(m: Sequence[Sequence[float]]) -> float:
    a, b, c = m[0], m[1], m[2]
    return (
        a[0] * (b[1] * c[2] - b[2] * c[1])
        - a[1] * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * c[1] - b[1] * c[0])
    )


def cell_volume(structure: Structure) -> float:
    return abs(det3(lattice_vectors(structure)))


def fractional_to_cartesian(structure: Structure, f: Vec3) -> Vec3:
    m = lattice_vectors(structure)
    return (
        f[0] * m[0][0] + f[1] * m[1][0] + f[2] * m[2][0],
        f[0] * m[0][1] + f[1] * m[1][1] + f[2] * m[2][1],
        f[0] * m[0][2] + f[1] * m[1][2] + f[2] * m[2][2],
    )


def inverse3(m: Mat3) -> Mat3:
    det = det3(m)
    if abs(det) < 1e-12:
        raise ValueError("lattice is singular")
    inv = 1.0 / det
    a, b, c = m
    return (
        (
            (b[1] * c[2] - b[2] * c[1]) * inv,
            (a[2] * c[1] - a[1] * c[2]) * inv,
            (a[1] * b[2] - a[2] * b[1]) * inv,
        ),
        (
            (b[2] * c[0] - b[0] * c[2]) * inv,
            (a[0] * c[2] - a[2] * c[0]) * inv,
            (a[2] * b[0] - a[0] * b[2]) * inv,
        ),
        (
            (b[0] * c[1] - b[1] * c[0]) * inv,
            (a[1] * c[0] - a[0] * c[1]) * inv,
            (a[0] * b[1] - a[1] * b[0]) * inv,
        ),
    )


def cartesian_to_fractional(structure: Structure, r: Vec3) -> Vec3:
    inv = inverse3(lattice_vectors(structure))
    return (
        r[0] * inv[0][0] + r[1] * inv[1][0] + r[2] * inv[2][0],
        r[0] * inv[0][1] + r[1] * inv[1][1] + r[2] * inv[2][1],
        r[0] * inv[0][2] + r[1] * inv[1][2] + r[2] * inv[2][2],
    )


def minimum_image_vector(structure: Structure, a: Vec3, b: Vec3) -> Vec3:
    d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    f = cartesian_to_fractional(structure, d)
    wrapped = tuple(
        (f[i] - round(f[i])) if structure.pbc[i] else f[i] for i in range(3)
    )
    return fractional_to_cartesian(structure, wrapped)  # type: ignore[arg-type]


def composition_of(sites: Iterable[Site]) -> dict[str, Any]:
    amounts: dict[str, float] = {}
    for site in sites:
        symbol = base_symbol(site.species)
        amounts[symbol] = amounts.get(symbol, 0.0) + site.occupancy
    values = list(amounts.values())
    integers = [round(v) for v in values]
    is_integer = all(abs(v - i) < 1e-6 for v, i in zip(values, integers))
    if is_integer and integers:
        divisor = integers[0]
        for value in integers[1:]:
            divisor = math.gcd(divisor, value)
        divisor = max(1, divisor)
        reduced = {k: v / divisor for k, v in amounts.items()}
    else:
        reduced = dict(amounts)

    def order(symbol: str) -> tuple[float, str]:
        return (ELECTRONEGATIVITY.get(symbol, math.inf), symbol)

    symbols = list(reduced)
    if "C" in symbols:
        ordered = ["C"] + (["H"] if "H" in symbols else []) + sorted(
            [s for s in symbols if s not in ("C", "H")], key=order
        )
    else:
        ordered = sorted(symbols, key=order)

    parts: list[str] = []
    for symbol in ordered:
        amount = reduced[symbol]
        if abs(amount - 1.0) < 1e-9:
            parts.append(symbol)
        else:
            rounded = round(amount, 4)
            parts.append(f"{symbol}{int(rounded) if rounded.is_integer() else rounded}")

    return {
        "reduced_formula": "".join(parts),
        "elements": sorted(amounts),
        "amounts": {k: round(v, 6) for k, v in amounts.items()},
        "total_atoms": round(sum(values), 6),
    }


def validate_structure(structure: Structure) -> ValidationReport:
    checks: list[ValidationCheck] = []

    def add(check_id: str, status: Literal["pass", "warning", "fail"], message: str) -> None:
        checks.append(ValidationCheck(check_id, status, message))

    vectors = structure.lattice
    lattice_ok = (
        len(vectors) == 3
        and all(len(row) == 3 for row in vectors)
        and all(math.isfinite(x) for row in vectors for x in row)
    )
    add(
        "lattice.finite",
        "pass" if lattice_ok else "fail",
        "Lattice is a finite 3x3 matrix." if lattice_ok else "Lattice must be a finite 3x3 matrix.",
    )

    volume = abs(det3(vectors)) if lattice_ok else 0.0
    if lattice_ok:
        add(
            "lattice.volume",
            "pass" if volume >= 1e-6 else "fail",
            f"Cell volume {volume:.4f} Å³." if volume >= 1e-6
            else f"Cell volume {volume:.3e} Å³ is too small.",
        )

    add(
        "sites.nonempty",
        "pass" if structure.sites else "fail",
        f"{len(structure.sites)} site(s)." if structure.sites else "A structure needs at least one site.",
    )

    unknown = sorted(
        {base_symbol(s.species) for s in structure.sites if base_symbol(s.species) not in ATOMIC_MASS}
    )
    add(
        "sites.species",
        "pass" if not unknown else "warning",
        "All species map to known elements."
        if not unknown
        else f"Unknown element symbol(s): {', '.join(unknown)}.",
    )

    bad_positions = [
        s for s in structure.sites
        if len(s.fractional_position) != 3 or not all(math.isfinite(x) for x in s.fractional_position)
    ]
    add(
        "sites.positions",
        "pass" if not bad_positions else "fail",
        "All fractional positions are finite."
        if not bad_positions
        else f"{len(bad_positions)} site(s) have non-finite coordinates.",
    )

    bad_occupancy = [s for s in structure.sites if not (0 < s.occupancy <= 1)]
    add(
        "sites.occupancy",
        "pass" if not bad_occupancy else "fail",
        "Occupancies are within (0, 1]." if not bad_occupancy else "Invalid occupancy.",
    )

    if not any(structure.pbc):
        add("cell.periodicity", "warning", "No periodic direction is active; the cell is a finite cluster.")
    else:
        add("cell.periodicity", "pass", "Periodic axes: " + "".join("1" if p else "0" for p in structure.pbc))

    if lattice_ok and volume >= 1e-6:
        lengths = [math.sqrt(sum(x * x for x in row)) for row in vectors]
        angles: list[float] = []
        for i in range(3):
            for j in range(i + 1, 3):
                dot = sum(vectors[i][k] * vectors[j][k] for k in range(3))
                cos = max(-1.0, min(1.0, dot / (lengths[i] * lengths[j])))
                angles.append(math.degrees(math.acos(cos)))
        worst = min(angles) if angles else 90.0
        if worst < 20 or worst > 160:
            add("cell.skew", "warning", f"Cell is strongly skewed (smallest angle {worst:.1f}°).")
        else:
            add("cell.skew", "pass", f"Cell geometry acceptable (smallest angle {worst:.1f}°).")

        positions = [fractional_to_cartesian(structure, s.fractional_position) for s in structure.sites]
        overlaps = 0
        closest = math.inf
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                d = minimum_image_vector(structure, positions[i], positions[j])
                dist = math.sqrt(sum(x * x for x in d))
                closest = min(closest, dist)
                if dist < OVERLAP_THRESHOLD_ANGSTROM:
                    overlaps += 1
        if overlaps:
            add("sites.overlap", "warning", f"{overlaps} pair(s) closer than {OVERLAP_THRESHOLD_ANGSTROM} Å (closest {closest:.3f} Å).")
        else:
            add("sites.overlap", "pass", f"No unphysical overlaps (closest pair {closest:.3f} Å).")

    if any(c.status == "fail" for c in checks):
        status: Literal["valid", "warning", "invalid"] = "invalid"
    elif any(c.status == "warning" for c in checks):
        status = "warning"
    else:
        status = "valid"
    return ValidationReport(status=status, checks=checks)


def canonical_json(value: Any) -> str:
    """Deterministic JSON with sorted keys and JavaScript-compatible numbers.

    JavaScript renders integral numbers without a decimal part ("0", "1"), so
    integral floats are normalised to ints before serialisation. This keeps the
    structure hash identical across the TypeScript, Rust and Python
    implementations.
    """

    def normalize(item: Any) -> Any:
        if isinstance(item, dict):
            return {key: normalize(sub) for key, sub in item.items()}
        if isinstance(item, (list, tuple)):
            return [normalize(sub) for sub in item]
        if isinstance(item, bool):
            return item
        if isinstance(item, float):
            if not math.isfinite(item):
                raise ValueError("Cannot canonicalise a non-finite number")
            if item.is_integer():
                return int(item)
            return item
        return item

    return json.dumps(normalize(value), sort_keys=True, separators=(",", ":"), allow_nan=False)


def _round6(value: float) -> float:
    """Rounds like JavaScript's Math.round(x * 1e6) / 1e6 (half away from -inf)."""
    scaled = value * 1e6
    rounded = math.floor(scaled + 0.5) if scaled >= 0 else -math.floor(-scaled + 0.5)
    result = rounded / 1e6
    return 0.0 if result == 0 else result


def structure_hash(structure: Structure) -> str:
    vectors = [
        [_round6(x) for x in row] for row in lattice_vectors(structure)
    ]
    sites = []
    for site in structure.sites:
        position = []
        for axis, value in enumerate(site.fractional_position):
            wrapped = value - math.floor(value) if structure.pbc[axis] else value
            position.append(_round6(wrapped))
        sites.append(
            {
                "species": base_symbol(site.species),
                "position": position,
                "occupancy": _round6(site.occupancy),
            }
        )
    sites.sort(key=lambda s: (s["species"], s["position"], s["occupancy"]))
    payload = {"schema": "structure-hash/1", "vectors": vectors, "pbc": list(structure.pbc), "sites": sites}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def total_mass_amu(structure: Structure) -> float:
    mass = 0.0
    for site in structure.sites:
        symbol = base_symbol(site.species)
        if symbol not in ATOMIC_MASS:
            raise ValueError(f"Unknown element '{symbol}'")
        mass += ATOMIC_MASS[symbol] * site.occupancy
    return mass


def density_g_per_cm3(structure: Structure) -> float:
    volume = cell_volume(structure)
    if volume <= 0:
        raise ValueError("Cell volume must be positive")
    amu_kg = 1.6605390666e-27
    return (total_mass_amu(structure) * amu_kg) / (volume * 1e-30) / 1000.0


def wrap_fractional(structure: Structure) -> Structure:
    sites = []
    for site in structure.sites:
        f = tuple(
            (site.fractional_position[i] - math.floor(site.fractional_position[i])) if structure.pbc[i]
            else site.fractional_position[i]
            for i in range(3)
        )
        sites.append(Site(site.species, f, site.label, site.occupancy, site.mobility))  # type: ignore[arg-type]
    return Structure(
        structure_id=structure.structure_id,
        lattice=structure.lattice,
        sites=sites,
        pbc=structure.pbc,
        length_unit=structure.length_unit,
        display_name=structure.display_name,
        space_group_symbol=structure.space_group_symbol,
        source=structure.source,
    )
