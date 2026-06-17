import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MobiusCurve } from '@/app/stores/mobiusCurve';

describe('MobiusCurve', () => {
  it('is a THREE.Curve subclass', () => {
    const curve = new MobiusCurve(1.0);
    expect(curve).toBeInstanceOf(THREE.Curve);
  });

  it('getPoint(0) and getPoint(1) are the same point (closed curve)', () => {
    // Plain circular path — t=0 and t=1 both land at (R, 0, 0)
    const curve = new MobiusCurve(1.0);
    const p0 = curve.getPoint(0);
    const p1 = curve.getPoint(1);
    expect(p0.distanceTo(p1)).toBeLessThan(0.001);
  });

  it('getPoint(0.5) is on the opposite side of the ring', () => {
    const curve = new MobiusCurve(1.0);
    const p0  = curve.getPoint(0);
    const p05 = curve.getPoint(0.5);
    // t=0 → x = +R, t=0.5 → angle=π → x = -R
    expect(p0.x).toBeGreaterThan(0);
    expect(p05.x).toBeLessThan(0);
  });

  it('pathRadius scales the ring diameter', () => {
    const small = new MobiusCurve(0.5).getPoint(0);
    const large = new MobiusCurve(2.0).getPoint(0);
    expect(large.x).toBeGreaterThan(small.x);
  });

  it('all points lie in the z=0 plane (twist is shader-side)', () => {
    const curve = new MobiusCurve(1.0);
    for (let i = 0; i <= 8; i++) {
      expect(curve.getPoint(i / 8).z).toBeCloseTo(0, 10);
    }
  });
});
