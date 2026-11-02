const EMB = (function () {
  const cx = 50,
    cy = 47,
    gr = 22,
    lr = 31;
  const leaves = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 8; i++) {
      const deg = side < 0 ? 114 + i * 14.5 : 66 - i * 14.5,
        t = (deg * Math.PI) / 180,
        s = 1 - i * 0.05;
      const bx = cx + lr * Math.cos(t),
        by = cy + lr * Math.sin(t);
      const dx = side < 0 ? -Math.sin(t) : Math.sin(t),
        dy = side < 0 ? Math.cos(t) : -Math.cos(t);
      const nx = Math.cos(t),
        ny = Math.sin(t);
      for (let k = -1; k <= 1; k += 2) {
        let vx = dx + nx * k * 0.62,
          vy = dy + ny * k * 0.62;
        const m = Math.hypot(vx, vy);
        vx /= m;
        vy /= m;
        leaves.push({
          x: bx + vx * 3.6 * s,
          y: by + vy * 3.6 * s,
          rot: (Math.atan2(vy, vx) * 180) / Math.PI,
          s,
        });
      }
    }
    const tt = ((side < 0 ? 230 : -50) * Math.PI) / 180,
      tdx = side < 0 ? -Math.sin(tt) : Math.sin(tt),
      tdy = side < 0 ? Math.cos(tt) : -Math.cos(tt);
    leaves.push({
      x: cx + lr * Math.cos(tt) + tdx * 3.2,
      y: cy + lr * Math.sin(tt) + tdy * 3.2,
      rot: (Math.atan2(tdy, tdx) * 180) / Math.PI,
      s: 0.72,
    });
  }
  const stemL =
    'M ' +
    (cx + lr * Math.cos((108 * Math.PI) / 180)).toFixed(2) +
    ' ' +
    (cy + lr * Math.sin((108 * Math.PI) / 180)).toFixed(2) +
    ' A ' +
    lr +
    ' ' +
    lr +
    ' 0 0 1 ' +
    (cx + lr * Math.cos((228 * Math.PI) / 180)).toFixed(2) +
    ' ' +
    (cy + lr * Math.sin((228 * Math.PI) / 180)).toFixed(2);
  const stemR =
    'M ' +
    (cx + lr * Math.cos((72 * Math.PI) / 180)).toFixed(2) +
    ' ' +
    (cy + lr * Math.sin((72 * Math.PI) / 180)).toFixed(2) +
    ' A ' +
    lr +
    ' ' +
    lr +
    ' 0 0 0 ' +
    (cx + lr * Math.cos((-48 * Math.PI) / 180)).toFixed(2) +
    ' ' +
    (cy + lr * Math.sin((-48 * Math.PI) / 180)).toFixed(2);
  return { cx, cy, gr, lr, leaves, stemL, stemR };
})();

export { EMB };
