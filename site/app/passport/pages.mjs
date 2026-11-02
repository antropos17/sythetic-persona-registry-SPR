import { EMB } from '../ui/emblem-data.mjs';
import { displayName, hashStr, mrz, rng } from './print-model.mjs';
import { NOTICE } from '../domain/notices.mjs';

function emblemCanvas(x, ox, oy, scale, ink) {
  const E = EMB;
  x.save();
  x.translate(ox - 50 * scale, oy - 50 * scale);
  x.scale(scale, scale);
  x.strokeStyle = ink;
  x.fillStyle = ink;
  x.lineWidth = 1.3;
  x.beginPath();
  x.arc(E.cx, E.cy, E.gr, 0, Math.PI * 2);
  x.stroke();
  x.save();
  x.beginPath();
  x.arc(E.cx, E.cy, E.gr, 0, Math.PI * 2);
  x.clip();
  x.lineWidth = 0.8;
  [0.5, 0.87].forEach((k) => {
    x.beginPath();
    x.ellipse(E.cx, E.cy, E.gr * k, E.gr, 0, 0, Math.PI * 2);
    x.stroke();
  });
  x.beginPath();
  x.moveTo(E.cx, E.cy - E.gr);
  x.lineTo(E.cx, E.cy + E.gr);
  x.stroke();
  [-0.5, 0, 0.5].forEach((k) => {
    x.beginPath();
    x.moveTo(E.cx - E.gr, E.cy + E.gr * k);
    x.lineTo(E.cx + E.gr, E.cy + E.gr * k);
    x.stroke();
  });
  x.restore();
  x.lineWidth = 1.1;
  x.stroke(new Path2D(E.stemL));
  x.stroke(new Path2D(E.stemR));
  E.leaves.forEach((l) => {
    x.save();
    x.translate(l.x, l.y);
    x.rotate((l.rot * Math.PI) / 180);
    x.beginPath();
    x.ellipse(0, 0, 4.4 * l.s, 1.75 * l.s, 0, 0, Math.PI * 2);
    x.fill();
    x.restore();
  });
  x.beginPath();
  const sx = E.cx,
    sy = E.cy - E.gr - 8;
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 1.5 : 4.4,
      a = -Math.PI / 2 + (i * Math.PI) / 4;
    x.lineTo(sx + r * Math.cos(a), sy + r * Math.sin(a));
  }
  x.closePath();
  x.fill();
  x.restore();
}

const PW = 900,
  PH = 1280;

const TEX = (function () {
  const mk = (w = PW, h = PH, scale = w === PW && h === PH ? 2 : 1) => {
    const c = document.createElement('canvas');
    c.width = w * scale;
    c.height = h * scale;
    c.getContext('2d').scale(scale, scale);
    return c;
  };
  function paper(x, tint, seed) {
    x.fillStyle = tint;
    x.fillRect(0, 0, PW, PH);
    const r = rng(seed);
    x.save();
    x.lineWidth = 1.1;
    for (let i = 0; i < 92; i++) {
      x.strokeStyle = i % 3 === 0 ? 'rgba(30,107,71,.16)' : 'rgba(44,58,140,.14)';
      x.beginPath();
      const ph = r() * 6,
        base = i * (PH / 88);
      for (let px = 0; px <= PW; px += 5) {
        const y = base + Math.sin(px / 64 + i * 0.31 + ph) * 16 + Math.sin(px / 21 + i * 0.9) * 3.5;
        px === 0 ? x.moveTo(px, y) : x.lineTo(px, y);
      }
      x.stroke();
    }
    x.restore();
    for (let i = 0; i < 5000; i++) {
      x.fillStyle = r() > 0.5 ? 'rgba(0,0,0,.025)' : 'rgba(255,255,255,.05)';
      x.fillRect(r() * PW, r() * PH, 1.5, 1.5);
    }
  }
  function spiro(x, cx, cy, R, color, alpha, lw) {
    x.save();
    x.globalAlpha = alpha;
    x.strokeStyle = color;
    x.lineWidth = lw || 1.2;
    x.beginPath();
    const a = 1,
      b = 0.3125,
      d = 0.62;
    for (let t = 0; t <= Math.PI * 2 * 5 + 0.01; t += 0.012) {
      const px = cx + R * ((a - b) * Math.cos(t) + d * Math.cos(((a - b) / b) * t));
      const py = cy + R * ((a - b) * Math.sin(t) - d * Math.sin(((a - b) / b) * t));
      t === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.stroke();
    x.restore();
  }
  function field(x, label, value, px, py, opt) {
    opt = opt || {};
    x.font = '400 21px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#5A6378';
    x.fillText(label, px, py);
    x.font = opt.font || '600 31px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = opt.color || '#18202E';
    x.fillText(value, px, py + 38, opt.max || 260);
  }
  function portrait(x, px, py, w, h, p, ghost) {
    x.save();
    x.beginPath();
    x.rect(px, py, w, h);
    x.clip();
    const g = x.createLinearGradient(0, py, 0, py + h);
    g.addColorStop(0, ghost ? 'rgba(220,225,232,.0)' : '#DCE2EA');
    g.addColorStop(1, ghost ? 'rgba(196,203,214,.0)' : '#BFC7D3');
    x.fillStyle = g;
    x.fillRect(px, py, w, h);
    if (p.photo && p.photo.complete && p.photo.naturalWidth) {
      const iw = p.photo.naturalWidth,
        ih = p.photo.naturalHeight,
        sw = iw * 0.62,
        sh = Math.min(ih * 0.86, (sw * h) / w),
        sx = (iw - sw) / 2,
        sy = ih * 0.1;
      x.filter = ghost
        ? 'grayscale(1) contrast(1.4)'
        : 'grayscale(1) contrast(1.18) brightness(1.04)';
      if (ghost) x.globalAlpha = 0.22;
      x.drawImage(p.photo, sx, sy, sw, sh, px, py, w, h);
      x.filter = 'none';
      x.globalAlpha = 1;
    } else {
      const cx = px + w / 2,
        s = w / 280;
      const tone = ghost ? 'rgba(60,70,90,.22)' : '#8E98A8',
        hair = ghost ? 'rgba(40,48,66,.26)' : '#4F5767';
      x.fillStyle = hair;
      x.beginPath();
      x.ellipse(cx, py + 150 * s, 78 * s, 92 * s, 0, 0, Math.PI * 2);
      x.fill();
      x.fillRect(cx - 78 * s, py + 150 * s, 156 * s, 150 * s);
      x.fillStyle = tone;
      x.beginPath();
      x.moveTo(px - 10, py + h);
      x.bezierCurveTo(
        px + 20 * s,
        py + 290 * s,
        cx - 70 * s,
        py + 262 * s,
        cx - 34 * s,
        py + 250 * s,
      );
      x.lineTo(cx + 34 * s, py + 250 * s);
      x.bezierCurveTo(
        cx + 70 * s,
        py + 262 * s,
        px + w - 20 * s,
        py + 290 * s,
        px + w + 10,
        py + h,
      );
      x.closePath();
      x.fill();
      x.fillRect(cx - 26 * s, py + 200 * s, 52 * s, 60 * s);
      x.beginPath();
      x.ellipse(cx, py + 165 * s, 58 * s, 72 * s, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = hair;
      x.beginPath();
      x.ellipse(cx, py + 112 * s, 64 * s, 40 * s, 0, Math.PI, Math.PI * 2);
      x.fill();
    }
    x.restore();
    if (!ghost) {
      x.strokeStyle = 'rgba(24,32,46,.35)';
      x.lineWidth = 2;
      x.strokeRect(px, py, w, h);
    }
  }
  function arcText(x, str, cx, cy, rad) {
    const ch = [...str],
      step = (Math.PI * 2) / ch.length;
    x.save();
    x.translate(cx, cy);
    x.textAlign = 'center';
    ch.forEach((c, i) => {
      x.save();
      x.rotate(i * step);
      x.translate(0, -rad);
      x.fillText(c, 0, 0);
      x.restore();
    });
    x.restore();
  }
  function seal(x, cx, cy, r, year) {
    x.save();
    x.translate(cx, cy);
    x.rotate(-0.24);
    x.translate(-cx, -cy);
    x.globalAlpha = 0.78;
    x.strokeStyle = '#2C3A8C';
    x.fillStyle = '#2C3A8C';
    x.lineWidth = 3.5;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 1.6;
    x.beginPath();
    x.arc(cx, cy, r - 8, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(cx, cy, r * 0.56, 0, Math.PI * 2);
    x.stroke();
    x.font = '700 15px Archivo, "Helvetica Neue", Arial, sans-serif';
    arcText(x, 'SYNTHETIC PERSONA REGISTRY ✦ SEALED ✦ ', cx, cy, r - 22);
    x.textAlign = 'center';
    x.font = '700 28px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillText('SPR', cx, cy + 4);
    x.font = '600 14px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillText(year, cx, cy + 24);
    x.restore();
  }
  function mrzDraw(x, lines, y0) {
    x.fillStyle = 'rgba(255,255,255,.62)';
    x.fillRect(30, y0 - 58, PW - 60, 170);
    x.fillStyle = '#18202E';
    x.font = '500 32px "IBM Plex Mono", monospace';
    x.textAlign = 'center';
    const cw = (PW - 104) / 44;
    lines.forEach((ln, li) => {
      [...ln].forEach((c, i) => x.fillText(c, 52 + cw * i + cw / 2, y0 + li * 58));
    });
    x.textAlign = 'left';
  }
  function dataPage(p) {
    const c = mk(),
      x = c.getContext('2d');
    paper(x, '#EEF0EA', hashStr(p.id));
    spiro(x, 640, 560, 300, '#2C3A8C', 0.18, 1.1);
    spiro(x, 640, 560, 180, '#1E6B47', 0.14, 1);
    x.strokeStyle = 'rgba(44,58,140,.4)';
    x.lineWidth = 2;
    x.strokeRect(26, 26, PW - 52, PH - 52);
    x.font = '600 34px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#14213D';
    x.fillText('Synthetic Persona Registry', 56, 92);
    x.font = 'italic 400 30px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#4A5368';
    x.textAlign = 'right';
    x.fillText('Passport', PW - 56, 92);
    x.textAlign = 'left';
    x.fillStyle = 'rgba(20,33,61,.45)';
    x.fillRect(56, 114, PW - 112, 2);
    field(x, 'Type', 'P-SYN', 56, 162);
    field(x, 'Code', p.code, 250, 162);
    field(x, 'Passport no.', p.id, 450, 162, {
      color: '#8E1E2A',
      font: '700 33px "IBM Plex Mono", monospace',
      max: 400,
    });
    portrait(x, 56, 236, 280, 364, p, false);
    seal(x, 316, 584, 78, '2026');
    const fx = 372;
    field(x, 'Surname / Given names', displayName(p), fx, 256, {
      font: '700 48px Archivo, "Helvetica Neue", Arial, sans-serif',
      color: '#14213D',
      max: 470,
    });
    field(x, 'Nature', p.nature, fx, 356);
    field(x, 'Language', p.lang, fx + 250, 356, { max: 220 });
    field(x, 'Occupation', p.role, fx, 446);
    field(x, 'Rights holder', p.holder, fx + 250, 446, { max: 220 });
    field(x, 'Date of issue', p.issued, fx, 536);
    field(x, 'Date of expiry', p.expires, fx + 250, 536, { max: 220 });
    field(x, 'Level of proof', p.level, fx, 626, { color: '#1E6B47' });
    x.font = '88px "Mrs Saint Delafield", cursive';
    x.fillStyle = '#1F2A55';
    x.fillText(p.name, 74, 742, 420);
    x.fillStyle = 'rgba(24,32,46,.5)';
    x.fillRect(66, 764, 380, 1.5);
    x.font = '400 20px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#5A6378';
    x.fillText('Signature of rights holder', 66, 792);
    portrait(x, PW - 56 - 130, 666, 130, 170, p, true);
    x.font = '400 20px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#5A6378';
    x.fillText('Authority', 530, 742);
    x.font = '600 27px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#18202E';
    x.fillText('SPR Registrar', 530, 776);
    x.font = '400 15px "IBM Plex Mono", monospace';
    x.fillStyle = 'rgba(44,58,140,.55)';
    const micro = ('SYNTHETICPERSONAREGISTRY' + p.id.replace(/-/g, '')).repeat(8);
    x.fillText(micro.slice(0, 96), 56, 860);
    x.fillText(micro.slice(5, 101), 56, 880);
    mrzDraw(x, mrz(p), PH - 150);
    return c;
  }
  function stampDraw(x, s, cx, cy, date) {
    x.save();
    x.translate(cx, cy);
    x.rotate((s.r * Math.PI) / 180);
    x.strokeStyle = s.c;
    x.fillStyle = s.c;
    x.textAlign = 'center';
    x.font = '800 36px Archivo, "Helvetica Neue", Arial, sans-serif';
    const vw = x.measureText(s.v).width;
    x.font = '600 22px Archivo, "Helvetica Neue", Arial, sans-serif';
    const tw = x.measureText(s.t).width;
    if (s.k === 'round') {
      const rad = Math.max(118, Math.min(150, vw / 2 + 34));
      x.lineWidth = 5;
      x.beginPath();
      x.arc(0, 0, rad, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 2;
      x.beginPath();
      x.arc(0, 0, rad - 12, 0, Math.PI * 2);
      x.stroke();
      x.font = '600 22px Archivo, "Helvetica Neue", Arial, sans-serif';
      x.fillText(s.t, 0, -30, rad * 1.6);
      x.font = '800 34px Archivo, "Helvetica Neue", Arial, sans-serif';
      x.fillText(s.v, 0, 12, rad * 1.7);
      if (s.sub) {
        x.font = '600 19px Archivo, "Helvetica Neue", Arial, sans-serif';
        x.fillText(s.sub, 0, 42, rad * 1.6);
      }
      x.font = '600 17px "IBM Plex Mono", monospace';
      x.fillText(date, 0, s.sub ? 72 : 50);
    } else {
      const w = Math.max(vw, tw) + 60,
        h = s.sub ? 150 : 128;
      x.lineWidth = 5;
      const rr = s.k === 'pill' ? h / 2 : s.k === 'double' ? 2 : 8;
      const box = (ww, hh, r) => {
        x.beginPath();
        x.roundRect ? x.roundRect(-ww / 2, -hh / 2, ww, hh, r) : x.rect(-ww / 2, -hh / 2, ww, hh);
        x.stroke();
      };
      if (s.k === 'dash') {
        x.setLineDash([14, 9]);
      }
      box(w, h, rr);
      x.setLineDash([]);
      if (s.k === 'double') {
        x.lineWidth = 2.5;
        box(w - 18, h - 18, rr);
      }
      x.font = '600 22px Archivo, "Helvetica Neue", Arial, sans-serif';
      x.fillText(s.t, 0, -h / 2 + 40);
      x.font = '800 36px Archivo, "Helvetica Neue", Arial, sans-serif';
      x.fillText(s.v, 0, 8);
      x.font = '600 17px "IBM Plex Mono", monospace';
      x.fillText(date, 0, h / 2 - 24);
    }
    x.restore();
  }
  function endorsements(p) {
    const c = mk(),
      x = c.getContext('2d');
    paper(x, '#EDEEE6', hashStr(p.id + 'e'));
    spiro(x, 260, 620, 260, '#2C3A8C', 0.12, 1);
    x.strokeStyle = 'rgba(44,58,140,.4)';
    x.lineWidth = 2;
    x.strokeRect(26, 26, PW - 52, PH - 52);
    x.font = 'italic 400 32px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#14213D';
    x.fillText('Endorsements', 56, 92);
    x.font = '400 22px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#5A6378';
    x.textAlign = 'right';
    x.fillText('Page 4', PW - 56, 92);
    x.textAlign = 'left';
    x.fillStyle = 'rgba(20,33,61,.45)';
    x.fillRect(56, 114, PW - 112, 2);
    const sc = mk(),
      s = sc.getContext('2d');
    const spots = [
      [245, 300],
      [640, 330],
      [260, 610],
      [655, 640],
      [440, 880],
    ];
    const date = ((p.history[0] && p.history[0].d) || '').toUpperCase();
    p.stamps.forEach((st, i) => stampDraw(s, st, spots[i][0], spots[i][1], date));
    const r = rng(hashStr(p.id + 'w'));
    s.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2600; i++) {
      s.globalAlpha = 0.35 + r() * 0.6;
      s.beginPath();
      s.arc(r() * PW, r() * PH * 0.8 + 60, 0.6 + r() * 2.2, 0, Math.PI * 2);
      s.fill();
    }
    s.globalCompositeOperation = 'source-over';
    s.globalAlpha = 1;
    x.save();
    x.globalAlpha = 0.9;
    x.globalCompositeOperation = 'multiply';
    x.drawImage(sc, 0, 0, PW, PH);
    x.restore();
    x.save();
    x.strokeStyle = '#1F2A55';
    x.lineWidth = 3;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(70, 1062);
    x.bezierCurveTo(110, 990, 140, 1100, 175, 1040);
    x.bezierCurveTo(205, 995, 220, 1080, 250, 1050);
    x.bezierCurveTo(280, 1020, 300, 990, 312, 1060);
    x.bezierCurveTo(330, 1100, 370, 1020, 420, 1044);
    x.bezierCurveTo(450, 1056, 470, 1040, 488, 1030);
    x.stroke();
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(110, 1080);
    x.bezierCurveTo(220, 1072, 360, 1076, 470, 1068);
    x.stroke();
    x.restore();
    x.fillStyle = 'rgba(24,32,46,.5)';
    x.fillRect(66, 1094, 400, 1.5);
    x.font = '400 20px Archivo, "Helvetica Neue", Arial, sans-serif';
    x.fillStyle = '#5A6378';
    x.fillText('Registrar, E. Halvorsen', 66, 1122);
    x.textAlign = 'right';
    x.fillText('Record', PW - 56, 1052);
    x.font = '500 26px "IBM Plex Mono", monospace';
    x.fillStyle = '#18202E';
    x.fillText(p.record.slice(0, 4) + '-' + p.record.slice(4), PW - 56, 1086);
    x.textAlign = 'left';
    const br = rng(hashStr(p.record));
    let bx = 56;
    x.fillStyle = '#18202E';
    while (bx < PW - 56) {
      const w = 1 + Math.floor(br() * 5);
      if (br() > 0.42) x.fillRect(bx, 1150, w, 74);
      bx += w + 1 + Math.floor(br() * 3);
    }
    return c;
  }
  function coverArt(x, fill, emboss) {
    const ink = fill;
    const txt = (t, y, font, ls) => {
      x.font = font;
      if ('letterSpacing' in x) x.letterSpacing = ls + 'px';
      x.textAlign = 'center';
      if (emboss) {
        x.fillStyle = 'rgba(0,0,0,.55)';
        x.fillText(t, PW / 2 + 2, y + 3);
      }
      x.fillStyle = ink;
      x.fillText(t, PW / 2, y);
      if ('letterSpacing' in x) x.letterSpacing = '0px';
    };
    txt('SYNTHETIC PERSONA', 200, '600 50px Archivo, "Helvetica Neue", Arial, sans-serif', 10);
    txt('REGISTRY', 266, '600 50px Archivo, "Helvetica Neue", Arial, sans-serif', 10);
    const cx = PW / 2,
      cy = 600;
    x.save();
    if (emboss) {
      x.shadowColor = 'rgba(0,0,0,.6)';
      x.shadowOffsetX = 2;
      x.shadowOffsetY = 3;
    }
    emblemCanvas(x, cx, cy - 10, 6.2, ink);
    x.restore();
    txt('PASSPORT', 1010, '600 66px Archivo, "Helvetica Neue", Arial, sans-serif', 24);
    x.save();
    x.strokeStyle = ink;
    x.lineWidth = 4;
    const cxx = PW / 2,
      cyy = 1110;
    x.beginPath();
    x.roundRect ? x.roundRect(cxx - 62, cyy - 38, 124, 76, 8) : x.rect(cxx - 62, cyy - 38, 124, 76);
    x.stroke();
    x.beginPath();
    x.arc(cxx, cyy, 22, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.moveTo(cxx - 62, cyy);
    x.lineTo(cxx - 22, cyy);
    x.moveTo(cxx + 22, cyy);
    x.lineTo(cxx + 62, cyy);
    x.stroke();
    x.restore();
  }
  function cover() {
    const c = mk(),
      x = c.getContext('2d');
    const g = x.createRadialGradient(PW * 0.3, PH * 0.25, 40, PW * 0.5, PH * 0.5, PH * 0.8);
    g.addColorStop(0, '#1D3A70');
    g.addColorStop(0.55, '#12285A');
    g.addColorStop(1, '#0A1A3D');
    x.fillStyle = g;
    x.fillRect(0, 0, PW, PH);
    const r = rng(77);
    for (let i = 0; i < 60000; i++) {
      x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.08)';
      x.fillRect(r() * PW, r() * PH, 1.6, 1.6);
    }
    const gold = x.createLinearGradient(0, 0, PW, PH);
    gold.addColorStop(0, '#8D97A6');
    gold.addColorStop(0.3, '#F1F4F8');
    gold.addColorStop(0.5, '#A7B1C0');
    gold.addColorStop(0.72, '#FFFFFF');
    gold.addColorStop(1, '#7C8796');
    coverArt(x, gold, true);
    return c;
  }
  function coverMask(metal) {
    const c = mk(PW, PH, 1),
      x = c.getContext('2d');
    x.fillStyle = metal ? '#000' : '#B4B4B4';
    x.fillRect(0, 0, PW, PH);
    coverArt(x, metal ? '#fff' : '#3A3A3A', false);
    return c;
  }
  function holoMask() {
    const c = mk(512, 728),
      x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 512, 728);
    if ('filter' in x) x.filter = 'blur(1.2px)';
    x.strokeStyle = '#fff';
    x.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) {
      x.beginPath();
      x.ellipse(360, 300, 130, 40, (i * Math.PI) / 14, 0, Math.PI * 2);
      x.stroke();
    }
    x.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      x.arc(360, 300, 90 + k * 8, 0, Math.PI * 2);
      x.stroke();
    }
    x.font = '700 18px sans-serif';
    x.fillStyle = 'rgba(255,255,255,.4)';
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 6; col++)
        x.fillText('SPR', col * 92 + (row % 2) * 46, 470 + row * 30);
    x.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) {
      x.beginPath();
      for (let px = 0; px <= 512; px += 4) {
        const y = 600 + i * 12 + Math.sin(px / 30 + i) * 6;
        px ? x.lineTo(px, y) : x.moveTo(px, y);
      }
      x.stroke();
    }
    return c;
  }
  function recordPage(p, kind, side) {
    const c = mk(),
      x = c.getContext('2d');
    paper(x, '#EEF0EA', hashStr(p.id + kind + side));
    x.strokeStyle = 'rgba(44,58,140,.35)';
    x.lineWidth = 2;
    x.strokeRect(26, 26, PW - 52, PH - 52);
    const title =
      kind === 'claims'
        ? side === 0
          ? 'Recorded claims'
          : 'Supporting context'
        : side === 0
          ? 'Record history'
          : 'Open risks';
    x.fillStyle = '#14213D';
    x.font = '700 40px Archivo, Arial, sans-serif';
    x.fillText(title, 56, 95);
    x.font = '500 23px "IBM Plex Mono", monospace';
    x.fillStyle = '#5A6378';
    x.fillText(p.id, 56, 138);
    x.fillRect(56, 162, PW - 112, 2);
    let y = 218;
    const paragraph = (text, size = 25, color = '#18202E') => {
      x.font = '400 ' + size + 'px Archivo, Arial, sans-serif';
      x.fillStyle = color;
      let line = '';
      for (const word of String(text).split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (x.measureText(next).width > PW - 124 && line) {
          x.fillText(line, 62, y);
          y += size * 1.4;
          line = word;
        } else line = next;
      }
      if (line) {
        x.fillText(line, 62, y);
        y += size * 1.4;
      }
    };
    const heading = (text) => {
      x.font = '700 29px Archivo, Arial, sans-serif';
      x.fillStyle = '#14213D';
      x.fillText(text, 62, y, PW - 124);
      y += 42;
    };
    if (kind === 'claims') {
      const claims = p.claims || [],
        cut = Math.ceil(claims.length / 2),
        part = side === 0 ? claims.slice(0, cut) : claims.slice(cut);
      for (const claim of part) {
        heading(claim.title);
        paragraph(claim.statement, 22, '#365079');
        paragraph(claim.basis, 24);
        if (claim.issue) paragraph('Unresolved: ' + claim.issue, 23, '#79500E');
        y += 28;
      }
      if (!part.length) paragraph('No additional claim context is listed in this demo record.');
    } else if (side === 0) {
      for (const event of p.history) {
        heading(event.d);
        paragraph(event.e, 27);
        y += 38;
      }
    } else {
      paragraph(NOTICE[p.status].name + ': ' + NOTICE[p.status].meaning, 29);
      y += 32;
      for (const [index, risk] of p.risks.entries()) {
        heading('Open issue ' + (index + 1));
        paragraph(risk, 28);
        y += 34;
      }
      if (!p.risks.length)
        paragraph(
          'No open risks are listed. This does not establish that every risk has been resolved.',
        );
    }
    x.fillStyle = '#5A6378';
    x.fillRect(56, PH - 140, PW - 112, 1);
    y = PH - 108;
    paragraph('Fictional demo record. No new evidence check.', 20, '#5A6378');
    x.font = '500 20px "IBM Plex Mono", monospace';
    x.fillText('SPR / ' + (kind === 'claims' ? 5 + side : 7 + side), 56, PH - 44);
    return c;
  }
  return { dataPage, endorsements, cover, coverMask, holoMask, recordPage };
})();

export { emblemCanvas, PW, PH, TEX };
