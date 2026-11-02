const PASSPORT_SPREADS = ['Identity and endorsements', 'Recorded claims', 'History and open risks'];

function passportCurve(progress, segments = 64) {
  const points = [{ x: 0, z: 0 }];
  for (let i = 0; i < segments; i++) {
    let t = Math.max(0, Math.min(1, progress * 1.5 - (0.5 * (i + 0.5)) / segments));
    t = t * t * (3 - 2 * t);
    const angle = Math.PI * t,
      previous = points[i];
    points.push({
      x: previous.x + Math.cos(angle) / segments,
      z: previous.z + Math.sin(angle) / segments,
    });
  }
  return points;
}

export { PASSPORT_SPREADS, passportCurve };
