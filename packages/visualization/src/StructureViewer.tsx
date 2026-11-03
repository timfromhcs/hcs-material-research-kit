/**
 * 3D structure viewer.
 *
 * Rendering only — no physics is inferred from the picture. Bonds are drawn as
 * a *derived visual aid* from element covalent radii and are not a claim about
 * electronic bonding. If WebGL is unavailable the component shows an explicit
 * message instead of a blank canvas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  cartesianPositions,
  cellVolume,
  compositionOf,
  minimumImageVector,
  type Structure,
} from "@hcs-materials/core";

/** CPK-inspired colours, chosen for contrast on dark and light backgrounds. */
export const ELEMENT_COLORS: Record<string, string> = {
  H: "#e8eef1",
  He: "#e6f0f6",
  Li: "#c4a0e8",
  Be: "#a8d99a",
  B: "#c9a0a0",
  C: "#5b6670",
  N: "#5b8def",
  O: "#ef5b5b",
  F: "#8fd694",
  Ne: "#8fd6e0",
  Na: "#b78cf0",
  Mg: "#9bd45b",
  Al: "#b9c2c9",
  Si: "#d9a066",
  P: "#ef9a4c",
  S: "#e3d24c",
  Cl: "#5fd67a",
  Ar: "#b6c4cf",
  K: "#c98cf0",
  Ca: "#7ac9a8",
  Ti: "#9fb4c7",
  Fe: "#e07b39",
  Co: "#6b8fd6",
  Ni: "#87b06b",
  Cu: "#d98b5b",
  Zn: "#a3a3c2",
  Ga: "#c9a3d9",
  Ge: "#8fb3a3",
  As: "#c97fb3",
  Se: "#d9c26b",
  Br: "#b05b5b",
  Kr: "#9fd6b3",
  Rb: "#d9a3d9",
  Sr: "#7ad6c9",
  Zr: "#8fc4d6",
  Nb: "#8fa3d6",
  Mo: "#6b9fa3",
  Ag: "#cfd6dc",
  Cd: "#b3a37a",
  In: "#b3a37a",
  Sn: "#9fb3c9",
  I: "#a66bd6",
  Xe: "#c9a8d6",
  Cs: "#d6b35b",
  Ba: "#8fd67a",
  La: "#7ab3d6",
  Ce: "#a3c97a",
  W: "#7a8fa3",
  Pt: "#cfd9e0",
  Au: "#e8c96b",
  Hg: "#b3bcc4",
  Pb: "#8f9aa3",
};

const DEFAULT_COLOR = "#a8b8c0";

export function elementColor(species: string): string {
  const base = species.replace(/[0-9]+$/, "");
  return ELEMENT_COLORS[base] ?? DEFAULT_COLOR;
}

const COVALENT_RADII: Record<string, number> = {
  H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Na: 1.66, Mg: 1.41, Al: 1.21,
  Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, K: 2.03, Ca: 1.76, Ti: 1.6, Fe: 1.32,
  Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.2, As: 1.19, Se: 1.2,
  Br: 1.2, Sr: 1.95, Zr: 1.75, Nb: 1.64, Mo: 1.54, Ag: 1.45, In: 1.42, Sn: 1.39,
  Ba: 2.15, La: 2.07, W: 1.62, Pt: 1.36, Au: 1.36, Pb: 1.46, Ar: 1.06,
};

export interface StructureViewerProps {
  structure: Structure;
  selectedSites?: number[];
  /** `additive` is true when Shift was held (toggle selection). */
  onSelectSite?: (index: number | null, additive: boolean) => void;
  showCell?: boolean;
  showBonds?: boolean;
  height?: number;
  emptyMessage?: string;
  webglUnavailableMessage?: string;
}

interface HoverInfo {
  index: number;
  species: string;
  x: number;
  y: number;
}

export function StructureViewer({
  structure,
  selectedSites = [],
  onSelectSite,
  showCell = true,
  showBonds = true,
  height,
  emptyMessage = "No structure loaded.",
  webglUnavailableMessage = "This browser did not provide a WebGL2 context, so the 3D view is unavailable. The numerical workbench still works.",
}: StructureViewerProps): JSX.Element {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    root: THREE.Group;
    atomMeshes: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    frame: number;
    dispose: () => void;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const composition = useMemo(() => compositionOf(structure.sites), [structure]);
  const selectedKey = selectedSites.join(",");

  // One-time renderer setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : String(setupError));
      return;
    }
    if (!renderer.getContext()) {
      setError("no-webgl");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 640, mount.clientHeight || 420, false);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(12, 10, 14);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.8;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(8, 12, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fe3d4, 0.6);
    rim.position.set(-10, -6, -8);
    scene.add(rim);

    const root = new THREE.Group();
    scene.add(root);

    let frame = 0;
    const animate = (): void => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = (): void => {
      const width = mount.clientWidth || 640;
      const height = mount.clientHeight || 420;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    sceneRef.current = {
      renderer,
      scene,
      camera,
      controls,
      root,
      atomMeshes: [],
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      frame,
      dispose: () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      },
    };
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Rebuild geometry when the structure or display options change.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const { root } = scene;
    for (const child of [...root.children]) {
      root.remove(child);
      child.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
    }
    scene.atomMeshes = [];
    if (structure.sites.length === 0) return;

    const positions = cartesianPositions(structure);
    const center = new THREE.Vector3();
    for (const p of positions) center.add(new THREE.Vector3(p[0], p[1], p[2]));
    center.divideScalar(positions.length);

    const scale = Math.cbrt(Math.max(cellVolume(structure), 1));
    const atomRadius = Math.max(0.18, scale * 0.055);
    const sphereGeometry = new THREE.SphereGeometry(1, 24, 18);

    positions.forEach((position, index) => {
      const site = structure.sites[index]!;
      const color = new THREE.Color(elementColor(site.species));
      const selected = selectedSites.includes(index);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.08,
        emissive: selected ? new THREE.Color("#4fd6c4") : new THREE.Color("#000000"),
        emissiveIntensity: selected ? 0.55 : 0,
      });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.position.set(position[0] - center.x, position[1] - center.y, position[2] - center.z);
      const radiusScale = 0.75 + Math.min(0.6, (COVALENT_RADII[site.species.replace(/[0-9]+$/, "")] ?? 1.4) * 0.12);
      mesh.scale.setScalar(atomRadius * radiusScale);
      mesh.userData.siteIndex = index;
      root.add(mesh);
      scene.atomMeshes.push(mesh);
    });

    if (showCell) {
      const m = structure.lattice.vectors;
      const corners: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        const f = [i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 1 : 0];
        corners.push(
          new THREE.Vector3(
            f[0]! * m[0][0] + f[1]! * m[1][0] + f[2]! * m[2][0] - center.x,
            f[0]! * m[0][1] + f[1]! * m[1][1] + f[2]! * m[2][1] - center.y,
            f[0]! * m[0][2] + f[1]! * m[1][2] + f[2]! * m[2][2] - center.z,
          ),
        );
      }
      const edges: Array<[number, number]> = [
        [0, 1], [1, 3], [3, 2], [2, 0],
        [4, 5], [5, 7], [7, 6], [6, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];
      const points: THREE.Vector3[] = [];
      for (const [a, b] of edges) {
        points.push(corners[a]!, corners[b]!);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0x4fd6c4, transparent: true, opacity: 0.55 });
      root.add(new THREE.LineSegments(geometry, material));
    }

    if (showBonds && positions.length > 1 && positions.length <= 1500) {
      const bondPositions: THREE.Vector3[] = [];
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const r = minimumImageVector(structure, positions[i]!, positions[j]!);
          const distance = Math.hypot(r[0], r[1], r[2]);
          const speciesA = structure.sites[i]!.species.replace(/[0-9]+$/, "");
          const speciesB = structure.sites[j]!.species.replace(/[0-9]+$/, "");
          const cutoff = (COVALENT_RADII[speciesA] ?? 1.4) + (COVALENT_RADII[speciesB] ?? 1.4) + 0.45;
          if (distance > 0.1 && distance <= cutoff) {
            bondPositions.push(
              new THREE.Vector3(positions[i]![0] - center.x, positions[i]![1] - center.y, positions[i]![2] - center.z),
              new THREE.Vector3(positions[i]![0] + r[0] - center.x, positions[i]![1] + r[1] - center.y, positions[i]![2] + r[2] - center.z),
            );
          }
        }
      }
      if (bondPositions.length > 0) {
        const geometry = new THREE.BufferGeometry().setFromPoints(bondPositions);
        const material = new THREE.LineBasicMaterial({ color: 0x9fb0b8, transparent: true, opacity: 0.5 });
        root.add(new THREE.LineSegments(geometry, material));
      }
    }

    // Fit the camera to the cell.
    const extent = Math.max(...structure.lattice.vectors.flat().map((v) => Math.abs(v)), 4);
    scene.camera.position.set(extent * 1.4, extent * 1.2, extent * 1.6);
    scene.camera.near = 0.1;
    scene.camera.far = extent * 40;
    scene.camera.updateProjectionMatrix();
    scene.controls.target.set(0, 0, 0);
    scene.controls.update();
  }, [structure, showCell, showBonds, selectedKey]);

  // Pointer interaction: hover tooltip + click selection.
  useEffect(() => {
    const mount = mountRef.current;
    const scene = sceneRef.current;
    if (!mount || !scene) return;
    const { renderer, camera, raycaster, pointer, atomMeshes } = scene;

    const updatePointer = (event: PointerEvent): void => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onMove = (event: PointerEvent): void => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(atomMeshes, false)[0];
      if (!hit) {
        setHover(null);
        return;
      }
      const index = hit.object.userData.siteIndex as number;
      const rect = renderer.domElement.getBoundingClientRect();
      setHover({
        index,
        species: structure.sites[index]?.species ?? "?",
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };

    const onClick = (event: PointerEvent): void => {
      updatePointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(atomMeshes, false)[0];
      onSelectSite?.(hit ? (hit.object.userData.siteIndex as number) : null, event.shiftKey);
    };

    const onLeave = (): void => setHover(null);
    const canvas = renderer.domElement;
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onClick);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onClick);
    };
  }, [structure, onSelectSite]);

  const speciesList = Object.keys(composition.amounts).sort();

  return (
    <div className="viewer" style={height ? { height } : undefined}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {error && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <p className="secondary small" style={{ maxWidth: 420 }}>
            {error === "no-webgl" ? webglUnavailableMessage : `${webglUnavailableMessage} (${error})`}
          </p>
        </div>
      )}
      {!error && structure.sites.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <p className="muted small">{emptyMessage}</p>
        </div>
      )}
      {!error && structure.sites.length > 0 && (
        <div className="viewer-legend" aria-hidden={false}>
          {speciesList.map((species) => (
            <span className="legend-item" key={species}>
              <span className="legend-swatch" style={{ background: elementColor(species) }} />
              {species} <span className="muted">{composition.amounts[species]}</span>
            </span>
          ))}
        </div>
      )}
      {hover && (
        <div
          className="badge badge-neutral"
          style={{ position: "absolute", left: hover.x + 12, top: hover.y + 12, pointerEvents: "none" }}
        >
          {hover.species} · site {hover.index}
        </div>
      )}
    </div>
  );
}
