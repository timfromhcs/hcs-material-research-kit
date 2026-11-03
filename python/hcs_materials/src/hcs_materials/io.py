"""Structure file IO: CIF (subset), POSCAR/CONTCAR, XYZ/extXYZ, HCS JSON.

The Python reader supports the same subset as the TypeScript implementation.
Both are checked against the same fixtures; neither is allowed to silently
invent elements, cells or coordinates.
"""

from __future__ import annotations

import json
import math
import re
import uuid
from pathlib import Path
from typing import Any, Callable

from .structure import (
    Structure,
    Site,
    base_symbol,
    cartesian_to_fractional,
    fractional_to_cartesian,
)

FIXTURE_EXTENSIONS = {".cif", ".poscar", ".vasp", ".contcar", ".xyz", ".json"}


class StructureIOError(ValueError):
    """Raised when a structure file cannot be read honestly."""


def new_structure_id() -> str:
    return f"struct_{uuid.uuid4().hex[:12]}"


def parse_number(raw: str) -> float:
    """Parses scientific numbers, tolerating crystallographic ESDs like 5.431(2)."""
    text = str(raw).strip().replace("\u2212", "-")
    match = re.match(r"^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?", text)
    if not match:
        raise StructureIOError(f"Not a number: {raw!r}")
    value = float(match.group(0))
    if not math.isfinite(value):
        raise StructureIOError(f"Not a finite number: {raw!r}")
    return value


def detect_format(text: str, filename: str | None = None) -> str:
    suffix = Path(filename).suffix.lower() if filename else ""
    if suffix == ".cif":
        return "cif"
    if suffix in {".poscar", ".vasp", ".contcar"}:
        return "poscar"
    if suffix == ".xyz":
        return "xyz"
    if suffix == ".json":
        return "hcs-json"

    stripped = text.lstrip()
    if stripped.startswith("{"):
        return "hcs-json"
    if re.search(r"_cell_length_a", text, re.IGNORECASE):
        return "cif"
    lines = [line for line in text.splitlines() if line.strip()]
    if len(lines) >= 6:
        number = r"^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$"
        scale_ok = re.match(number, lines[1].strip()) is not None or len(lines[1].split()) in (1, 3)
        lattice_ok = all(
            len(lines[i].split()) == 3 and all(re.match(number, p) for p in lines[i].split())
            for i in (2, 3, 4)
        )
        if scale_ok and lattice_ok:
            return "poscar"
    return "xyz"


def read_structure(text: str, filename: str | None = None) -> tuple[Structure, list[str]]:
    fmt = detect_format(text, filename)
    if fmt == "cif":
        structure, warnings, _ = read_cif(text, filename)
        return structure, warnings
    if fmt == "poscar":
        return read_poscar(text, filename)
    if fmt == "hcs-json":
        return read_hcs_json(text), []
    return read_xyz(text, filename)


# --------------------------------------------------------------------------
# CIF
# --------------------------------------------------------------------------


def _tokenize_cif(text: str) -> list[str]:
    tokens: list[str] = []
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.startswith(";"):
            parts = [line[1:]]
            index += 1
            while index < len(lines) and not lines[index].startswith(";"):
                parts.append(lines[index])
                index += 1
            tokens.append("\n".join(parts))
            index += 1
            continue
        if "#" in line:
            quote_state = None
            cut = len(line)
            for position, char in enumerate(line):
                if char in "'\"":
                    quote_state = None if quote_state == char else (quote_state or char)
                elif char == "#" and quote_state is None:
                    cut = position
                    break
            line = line[:cut]
        position = 0
        while position < len(line):
            while position < len(line) and line[position].isspace():
                position += 1
            if position >= len(line):
                break
            char = line[position]
            if char in "'\"":
                quote = char
                position += 1
                value = []
                while position < len(line) and line[position] != quote:
                    value.append(line[position])
                    position += 1
                position += 1
                tokens.append("".join(value))
            else:
                start = position
                while position < len(line) and not line[position].isspace():
                    position += 1
                tokens.append(line[start:position])
        index += 1
    return tokens


def _parse_cif(text: str) -> tuple[dict[str, str], list[tuple[list[str], list[list[str]]]]]:
    tokens = _tokenize_cif(text)
    tags: dict[str, str] = {}
    loops: list[tuple[list[str], list[list[str]]]] = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        lower = token.lower()
        if lower.startswith("data_") or lower == "stop_":
            index += 1
            continue
        if lower == "loop_":
            index += 1
            headers: list[str] = []
            while index < len(tokens) and tokens[index].startswith("_"):
                headers.append(tokens[index].lower())
                index += 1
            values: list[str] = []
            while index < len(tokens):
                value = tokens[index]
                value_lower = value.lower()
                if (
                    value_lower.startswith("_")
                    or value_lower == "loop_"
                    or value_lower.startswith("data_")
                    or value_lower == "stop_"
                ):
                    break
                values.append(value)
                index += 1
            if headers:
                rows = [
                    values[i : i + len(headers)]
                    for i in range(0, len(values) - len(headers) + 1, len(headers))
                ]
                loops.append((headers, rows))
            continue
        if token.startswith("_"):
            if index + 1 < len(tokens):
                tags[lower] = tokens[index + 1]
                index += 2
            else:
                index += 1
            continue
        index += 1
    return tags, loops


def _cell_from_parameters(a: float, b: float, c: float, alpha: float, beta: float, gamma: float):
    rad = math.pi / 180.0
    alpha_r, beta_r, gamma_r = alpha * rad, beta * rad, gamma * rad
    sin_gamma = math.sin(gamma_r)
    if abs(sin_gamma) < 1e-9:
        raise StructureIOError("CIF cell is degenerate (gamma is 0 or 180 degrees)")
    cos_alpha, cos_beta, cos_gamma = math.cos(alpha_r), math.cos(beta_r), math.cos(gamma_r)
    cx = c * cos_beta
    cy = c * (cos_alpha - cos_beta * cos_gamma) / sin_gamma
    cz_sq = c * c - cx * cx - cy * cy
    if cz_sq <= 0:
        raise StructureIOError("CIF cell parameters do not form a valid cell")
    return (
        (a, 0.0, 0.0),
        (b * cos_gamma, b * sin_gamma, 0.0),
        (cx, cy, math.sqrt(cz_sq)),
    )


def _symop(expression: str) -> Callable[[tuple[float, float, float]], tuple[float, float, float]]:
    components = expression.lower().replace(" ", "").split(",")
    if len(components) != 3:
        raise StructureIOError(f"Invalid symmetry operation {expression!r}")

    def ratio(text: str) -> float:
        if "/" in text:
            numerator, _, denominator = text.partition("/")
            return float(numerator) / float(denominator)
        return float(text)

    parsed: list[tuple[float, float, float, float]] = []
    for component in components:
        normalized = component if component[:1] in "+-" else f"+{component}"
        terms = re.findall(r"[+-][^+-]+", normalized)
        if not terms:
            raise StructureIOError(f"Invalid symmetry component {component!r}")
        x = y = z = constant = 0.0
        for term in terms:
            sign = -1.0 if term[0] == "-" else 1.0
            body = term[1:]
            match = re.search(r"[xyz]", body)
            if match:
                coefficient_text = body[: match.start()]
                coefficient = 1.0 if coefficient_text == "" else ratio(coefficient_text)
                axis = match.group(0)
                if axis == "x":
                    x += sign * coefficient
                elif axis == "y":
                    y += sign * coefficient
                else:
                    z += sign * coefficient
            else:
                constant += sign * ratio(body)
        parsed.append((x, y, z, constant))

    def apply(f: tuple[float, float, float]) -> tuple[float, float, float]:
        out = []
        for x, y, z, constant in parsed:
            out.append(x * f[0] + y * f[1] + z * f[2] + constant)
        return (out[0], out[1], out[2])

    return apply


def read_cif(text: str, filename: str | None = None) -> tuple[Structure, list[str], int]:
    tags, loops = _parse_cif(text)
    warnings: list[str] = []

    def number(tag: str) -> float | None:
        raw = tags.get(tag)
        return None if raw is None else parse_number(raw)

    a, b, c = number("_cell_length_a"), number("_cell_length_b"), number("_cell_length_c")
    if a is None or b is None or c is None:
        raise StructureIOError("CIF is missing _cell_length_a/b/c")
    vectors = _cell_from_parameters(
        a,
        b,
        c,
        number("_cell_angle_alpha") or 90.0,
        number("_cell_angle_beta") or 90.0,
        number("_cell_angle_gamma") or 90.0,
    )

    atom_loop = None
    for headers, rows in loops:
        if any(h in headers for h in ("_atom_site_fract_x", "_atom_site_cartn_x")):
            atom_loop = (headers, rows)
            break
    if atom_loop is None:
        raise StructureIOError("CIF contains no _atom_site loop with coordinates")
    headers, rows = atom_loop

    def column(name: str) -> int:
        try:
            return headers.index(name)
        except ValueError:
            return -1

    idx_label = column("_atom_site_label")
    idx_type = column("_atom_site_type_symbol")
    idx_fx, idx_fy, idx_fz = (column(f"_atom_site_fract_{axis}") for axis in "xyz")
    idx_occ = column("_atom_site_occupancy")
    # Build a temporary structure for cartesian -> fractional.
    temp = Structure(structure_id="cif-temp", lattice=vectors, sites=[])

    sites: list[Site] = []
    for index, row in enumerate(rows):
        raw_species = (row[idx_type] if idx_type >= 0 else row[idx_label] if idx_label >= 0 else "")
        species = base_symbol(re.sub(r"[^A-Za-z]", "", raw_species))
        if not species:
            raise StructureIOError(f"CIF atom site {index + 1} has no element symbol")
        if idx_fx >= 0:
            position = (parse_number(row[idx_fx]), parse_number(row[idx_fy]), parse_number(row[idx_fz]))
        else:
            idx_cx = column("_atom_site_cartn_x")
            idx_cy = column("_atom_site_cartn_y")
            idx_cz = column("_atom_site_cartn_z")
            cart = (parse_number(row[idx_cx]), parse_number(row[idx_cy]), parse_number(row[idx_cz]))
            position = cartesian_to_fractional(temp, cart)
        occupancy = parse_number(row[idx_occ]) if idx_occ >= 0 else 1.0
        label = row[idx_label] if idx_label >= 0 else f"{species}{index + 1}"
        sites.append(Site(species, position, label, occupancy if occupancy > 0 else 1.0))

    symop_headers = None
    for loop_headers, loop_rows in loops:
        for position, header in enumerate(loop_headers):
            if "symop_operation_xyz" in header or "_symmetry_equiv_pos_as_xyz" in header:
                symop_headers = (position, loop_rows)
                break
        if symop_headers:
            break

    operations = []
    if symop_headers:
        position, loop_rows = symop_headers
        operations = [row[position] for row in loop_rows if row[position]]
    else:
        for key, value in tags.items():
            if "symop_operation_xyz" in key or "_symmetry_equiv_pos_as_xyz" in key:
                operations.append(value)

    space_group = tags.get("_symmetry_space_group_name_h-m") or tags.get("_space_group_name_h-m_alt")

    applied = 0
    if operations:
        generated: list[Site] = []
        seen: set[tuple] = set()
        tolerance = 1e-4
        for operation in operations:
            function = _symop(operation)
            for site in sites:
                f = function(site.fractional_position)
                wrapped = tuple(
                    (value - math.floor(value)) if value - math.floor(value) < 1 - tolerance else 0.0
                    for value in f
                )
                key = (
                    site.species,
                    round(wrapped[0] / tolerance),
                    round(wrapped[1] / tolerance),
                    round(wrapped[2] / tolerance),
                )
                if key in seen:
                    continue
                seen.add(key)
                generated.append(Site(site.species, wrapped, site.label, site.occupancy))  # type: ignore[arg-type]
        sites = generated
        applied = len(operations)
    elif space_group and not re.match(r"^\s*(p\s*1|p1)\s*$", space_group, re.IGNORECASE):
        warnings.append(
            f"CIF declares space group '{space_group}' without symmetry operations; "
            "read as P1 with the listed sites only."
        )

    structure = Structure(
        structure_id=new_structure_id(),
        lattice=vectors,
        sites=sites,
        display_name=Path(filename).stem if filename else None,
        space_group_symbol=space_group,
        source={"format": "cif", "filename": filename} if filename else {"format": "cif"},
    )
    return structure, warnings, applied


def write_cif(structure: Structure) -> str:
    lengths = [math.sqrt(sum(x * x for x in row)) for row in structure.lattice]

    def angle(u, v) -> float:
        dot = sum(u[i] * v[i] for i in range(3))
        cos = dot / (math.sqrt(sum(x * x for x in u)) * math.sqrt(sum(x * x for x in v)))
        return math.degrees(math.acos(max(-1.0, min(1.0, cos))))

    m = structure.lattice
    data_name = re.sub(r"[^A-Za-z0-9_.-]", "_", structure.display_name or structure.structure_id)
    lines = [
        f"data_{data_name}",
        "_audit_creation_method 'HCS Material Research Kit (python)'",
        f"_cell_length_a {lengths[0]:.6f}",
        f"_cell_length_b {lengths[1]:.6f}",
        f"_cell_length_c {lengths[2]:.6f}",
        f"_cell_angle_alpha {angle(m[1], m[2]):.6f}",
        f"_cell_angle_beta {angle(m[0], m[2]):.6f}",
        f"_cell_angle_gamma {angle(m[0], m[1]):.6f}",
        "_symmetry_space_group_name_H-M 'P 1'",
        "loop_",
        "_symmetry_equiv_pos_as_xyz",
        "'x, y, z'",
        "loop_",
        "_atom_site_label",
        "_atom_site_type_symbol",
        "_atom_site_fract_x",
        "_atom_site_fract_y",
        "_atom_site_fract_z",
        "_atom_site_occupancy",
    ]
    for index, site in enumerate(structure.sites):
        f = site.fractional_position
        label = re.sub(r"\s+", "_", site.label or f"{site.species}{index + 1}")
        lines.append(
            f"{label} {base_symbol(site.species)} {f[0]:.8f} {f[1]:.8f} {f[2]:.8f} {site.occupancy:.4f}"
        )
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# POSCAR
# --------------------------------------------------------------------------


def read_poscar(text: str, filename: str | None = None) -> tuple[Structure, list[str]]:
    lines = text.splitlines()
    if len(lines) < 8:
        raise StructureIOError("POSCAR is too short to be valid")
    warnings: list[str] = []
    comment = lines[0].strip()
    scale_values = [parse_number(value) for value in lines[1].split()]
    lattice = [[parse_number(value) for value in lines[i].split()[:3]] for i in (2, 3, 4)]
    if any(len(row) != 3 for row in lattice):
        raise StructureIOError("POSCAR lattice lines must contain three numbers")

    if len(scale_values) == 1:
        scale = scale_values[0]
        if scale == 0:
            raise StructureIOError("POSCAR scale factor must not be zero")
        if scale < 0:
            target = abs(scale)
            from .structure import det3

            det = abs(det3(lattice))
            if det < 1e-12:
                raise StructureIOError("POSCAR lattice is degenerate")
            factor = (target / det) ** (1.0 / 3.0)
            lattice = [[value * factor for value in row] for row in lattice]
        else:
            lattice = [[value * scale for value in row] for row in lattice]
    elif len(scale_values) == 3:
        lattice = [[lattice[i][j] * scale_values[i] for j in range(3)] for i in range(3)]
    else:
        raise StructureIOError("POSCAR line 2 must contain one or three scale factors")

    line5 = lines[5].strip()
    if re.fullmatch(r"[\d\s]+", line5):
        species_names = None
        counts_index = 5
    else:
        species_names = line5.split()
        counts_index = 6
    counts = [parse_number(value) for value in lines[counts_index].split()]
    if any((not float(count).is_integer()) or count < 0 for count in counts):
        raise StructureIOError("Invalid POSCAR atom counts")
    counts = [int(count) for count in counts]
    if species_names is not None and len(species_names) != len(counts):
        raise StructureIOError("POSCAR species/count length mismatch")
    if species_names is None:
        species_names = [f"X{i + 1}" for i in range(len(counts))]
        warnings.append("POSCAR has no species line (VASP 4); elements named X1..Xn and not guessed.")

    cursor = counts_index + 1
    selective = lines[cursor].strip().lower().startswith("s")
    if selective:
        cursor += 1
    mode = lines[cursor].strip().lower()
    direct = mode.startswith("d")
    cartesian = mode.startswith("c") or mode.startswith("k")
    if not (direct or cartesian):
        raise StructureIOError("POSCAR coordinate mode must be Direct or Cartesian")
    cursor += 1

    temp = Structure(structure_id="poscar-temp", lattice=tuple(tuple(r) for r in lattice), sites=[])
    species_per_atom: list[str] = []
    for index, count in enumerate(counts):
        species_per_atom.extend([species_names[index]] * count)

    sites: list[Site] = []
    for atom in range(sum(counts)):
        parts = lines[cursor + atom].split()
        if len(parts) < 3:
            raise StructureIOError(f"POSCAR atom line {atom + 1} is malformed")
        coords = (parse_number(parts[0]), parse_number(parts[1]), parse_number(parts[2]))
        if direct:
            position = coords
        else:
            scale = abs(scale_values[0]) if len(scale_values) == 1 else 1.0
            position = cartesian_to_fractional(
                temp, (coords[0] * scale, coords[1] * scale, coords[2] * scale)
            )
        mobility = None
        if selective and len(parts) >= 6:
            mobility = tuple(part.lower().startswith("t") for part in parts[3:6])  # type: ignore[assignment]
        sites.append(Site(species_per_atom[atom], position, f"{species_per_atom[atom]}{atom + 1}", 1.0, mobility))

    structure = Structure(
        structure_id=new_structure_id(),
        lattice=tuple(tuple(row) for row in lattice),  # type: ignore[arg-type]
        sites=sites,
        display_name=comment or (Path(filename).stem if filename else None),
        source={"format": "poscar", "filename": filename} if filename else {"format": "poscar"},
    )
    return structure, warnings


def write_poscar(structure: Structure) -> str:
    groups: dict[str, list[Site]] = {}
    for site in structure.sites:
        groups.setdefault(base_symbol(site.species), []).append(site)
    symbols = list(groups)
    lines = [structure.display_name or structure.structure_id, "1.0"]
    for row in structure.lattice:
        lines.append(" ".join(f"{value:.12f}" for value in row))
    lines.append(" ".join(symbols))
    lines.append(" ".join(str(len(groups[s])) for s in symbols))
    lines.append("Direct")
    for symbol in symbols:
        for site in groups[symbol]:
            f = site.fractional_position
            lines.append(f"{f[0]:.12f} {f[1]:.12f} {f[2]:.12f}")
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# XYZ
# --------------------------------------------------------------------------


def read_xyz(text: str, filename: str | None = None) -> tuple[Structure, list[str]]:
    lines = text.splitlines()
    warnings: list[str] = []
    if not lines:
        raise StructureIOError("XYZ file is empty")
    count = parse_number(lines[0].strip())
    if not float(count).is_integer() or count <= 0:
        raise StructureIOError("XYZ atom count must be a positive integer")
    count = int(count)
    comment = lines[1] if len(lines) > 1 else ""

    lattice = None
    pbc = [False, False, False]
    match = re.search(r'Lattice\s*=\s*"([^"]+)"', comment)
    if match:
        values = [parse_number(v) for v in match.group(1).split()]
        if len(values) != 9:
            raise StructureIOError("extxyz Lattice must contain 9 numbers")
        lattice = (
            (values[0], values[1], values[2]),
            (values[3], values[4], values[5]),
            (values[6], values[7], values[8]),
        )
    match = re.search(r'pbc\s*=\s*"([^"]+)"', comment)
    if match:
        flags = match.group(1).split()
        if len(flags) == 3:
            pbc = [flag.lower() in ("t", "true", "1") for flag in flags]
        else:
            warnings.append("extxyz pbc must contain three flags; using non-periodic")

    species: list[str] = []
    positions = []
    for index in range(count):
        if 2 + index >= len(lines):
            raise StructureIOError(f"XYZ ends early: expected {count} atom lines")
        parts = lines[2 + index].split()
        if len(parts) < 4:
            raise StructureIOError(f"XYZ atom line {index + 1} is malformed")
        symbol = base_symbol(re.sub(r"[^A-Za-z]", "", parts[0]))
        if not symbol:
            raise StructureIOError(f"XYZ atom line {index + 1} has no element symbol")
        species.append(symbol)
        positions.append((parse_number(parts[1]), parse_number(parts[2]), parse_number(parts[3])))

    if lattice is None:
        padding = 10.0
        mins = [min(p[axis] for p in positions) for axis in range(3)]
        maxs = [max(p[axis] for p in positions) for axis in range(3)]
        lengths = [max(maxs[i] - mins[i] + 2 * padding, 1.0) for i in range(3)]
        lattice = ((lengths[0], 0.0, 0.0), (0.0, lengths[1], 0.0), (0.0, 0.0, lengths[2]))
        warnings.append(
            "XYZ has no cell. Created a non-periodic bounding box with 10 Å padding; "
            "positions are unchanged."
        )

    temp = Structure(structure_id="xyz-temp", lattice=lattice, sites=[])
    sites = [
        Site(species[i], cartesian_to_fractional(temp, positions[i]), f"{species[i]}{i + 1}", 1.0)
        for i in range(count)
    ]
    structure = Structure(
        structure_id=new_structure_id(),
        lattice=lattice,
        sites=sites,
        pbc=tuple(pbc),  # type: ignore[arg-type]
        display_name=comment.strip() or (Path(filename).stem if filename else None),
        source={"format": "xyz", "filename": filename} if filename else {"format": "xyz"},
    )
    return structure, warnings


def write_xyz(structure: Structure) -> str:
    m = structure.lattice
    pbc = " ".join("T" if flag else "F" for flag in structure.pbc)
    flat = " ".join(f"{value:.10f}" for row in m for value in row)
    lines = [
        str(len(structure.sites)),
        f'Lattice="{flat}" pbc="{pbc}" properties=species:S:1:pos:R:3',
    ]
    for site in structure.sites:
        p = fractional_to_cartesian(structure, site.fractional_position)
        lines.append(f"{base_symbol(site.species)} {p[0]:.10f} {p[1]:.10f} {p[2]:.10f}")
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# HCS JSON
# --------------------------------------------------------------------------


def read_hcs_json(text: str) -> Structure:
    data = json.loads(text)
    if "sites" not in data or "lattice" not in data:
        raise StructureIOError("Not an HCS structure document")
    vectors = data["lattice"]["vectors"]
    sites = [
        Site(
            site["species"],
            tuple(site["fractional_position"]),  # type: ignore[arg-type]
            site.get("label"),
            site.get("occupancy", 1.0),
            tuple(site["mobility"]) if site.get("mobility") else None,  # type: ignore[arg-type]
        )
        for site in data["sites"]
    ]
    return Structure(
        structure_id=data.get("structure_id") or new_structure_id(),
        lattice=tuple(tuple(row) for row in vectors),  # type: ignore[arg-type]
        sites=sites,
        pbc=tuple(data.get("pbc", [True, True, True])),  # type: ignore[arg-type]
        length_unit=data.get("length_unit", "angstrom"),
        display_name=data.get("display_name"),
        space_group_symbol=(data.get("space_group") or {}).get("symbol"),
        source=data.get("source"),
    )


def write_structure(structure: Structure, fmt: str) -> str:
    if fmt == "cif":
        return write_cif(structure)
    if fmt == "poscar":
        return write_poscar(structure)
    if fmt == "xyz":
        return write_xyz(structure)
    if fmt in ("hcs-json", "json"):
        return structure.to_json()
    raise StructureIOError(f"Unsupported format {fmt!r}")


def read_structure_file(path: str | Path) -> tuple[Structure, list[str]]:
    file_path = Path(path)
    if not file_path.exists():
        raise StructureIOError(f"File not found: {file_path}")
    if file_path.stat().st_size > 64 * 1024 * 1024:
        raise StructureIOError("Structure file exceeds the 64 MB limit")
    return read_structure(file_path.read_text(encoding="utf-8", errors="replace"), file_path.name)


def format_for_path(path: str | Path) -> str:
    suffix = Path(path).suffix.lower()
    return {
        ".cif": "cif",
        ".poscar": "poscar",
        ".vasp": "poscar",
        ".xyz": "xyz",
        ".json": "hcs-json",
    }.get(suffix, "hcs-json")
