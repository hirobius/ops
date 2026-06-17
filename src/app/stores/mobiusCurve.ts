/**
 * MobiusCurve — plain circular torus centerline for THREE.TubeGeometry.
 *
 * Intentionally generates NO twist in the path. The Möbius twist is applied
 * entirely in the vertex shader via uTwistCount × uTwistAmount uniforms
 * (Rodrigues rotation around the path tangent at each cross-section), making
 * twist smoothly animatable without any geometry rebuild.
 *
 * Parametric form (t ∈ [0, 1]):
 *   angle = t · 2π
 *   x(t)  = R · cos(angle)
 *   y(t)  = R · sin(angle)
 *   z(t)  = 0
 *
 * R = pathRadius. TubeGeometry sweeps the cross-section tube around this path.
 */

import * as THREE from 'three';

export class MobiusCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private pathRadius: number) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2;
    return target.set(
      this.pathRadius * Math.cos(angle),
      this.pathRadius * Math.sin(angle),
      0,
    );
  }
}
