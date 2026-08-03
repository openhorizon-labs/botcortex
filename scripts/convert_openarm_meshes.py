"""DAE (COLLADA, with materials) -> decimated GLB for the web.

The official OpenArm visual meshes are ~78 MB of COLLADA — correct geometry and
colors, far too heavy to ship. This decimates each mesh and writes GLB, keeping
the material colors the DAE carries.

Run: uv run --with trimesh --with pycollada --with fast-simplification \
        python convert_meshes.py <description-dir> <out-dir>
"""

import sys
from pathlib import Path

import numpy as np
import trimesh

FILE_BUDGET = 18000  # faces per link, split across its parts by size
MIN_FACES = 400      # never crush a small part into nothing


def convert(src: Path, dst: Path) -> tuple[int, int, int]:
    scene_or_mesh = trimesh.load(src, force="scene")

    parts = [
        (name, geom)
        for name, geom in scene_or_mesh.geometry.items()
        if isinstance(geom, trimesh.Trimesh) and len(geom.faces) > 0
    ]
    file_faces = sum(len(g.faces) for _, g in parts) or 1

    meshes = []
    for name, geom in parts:
        before = len(geom.faces)
        share = max(MIN_FACES, int(FILE_BUDGET * before / file_faces))
        if before > share:
            try:
                geom = geom.simplify_quadric_decimation(face_count=share)
            except Exception as e:  # noqa: BLE001 — decimation is best-effort
                print(f"    ! decimation failed for {name}: {e}")
        meshes.append((name, geom, before))

    out = trimesh.Scene()
    total_before = total_after = 0
    for name, geom, before in meshes:
        total_before += before
        total_after += len(geom.faces)
        out.add_geometry(geom, geom_name=name)

    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(trimesh.exchange.gltf.export_glb(out))
    return total_before, total_after, dst.stat().st_size


def main(source: Path, out_dir: Path) -> None:
    targets = [
        *sorted((source / "assets/robot/openarm_v1.0/mesh/arm/visual").glob("*.dae")),
        *sorted((source / "assets/robot/openarm_v1.0/mesh/body/visual").glob("*.dae")),
        *sorted((source / "assets/end_effector/parallel_link/meshes/visual").glob("*.dae")),
    ]
    total = 0
    for src in targets:
        rel = src.relative_to(source).with_suffix(".glb")
        dst = out_dir / rel
        before, after, size = convert(src, dst)
        total += size
        print(f"  {rel}: {before} -> {after} faces, {size / 1e6:.2f} MB")
    print(f"total: {total / 1e6:.1f} MB across {len(targets)} meshes")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
