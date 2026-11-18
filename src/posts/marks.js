// Labels, arrows, circles and logo stamps people add on top of a post's map.
// Positions are stored as map locations (lat/lng), so a mark stays on the same
// spot in every size, every video frame and every map style.
//
// mark: { id, kind: 'label'|'arrow'|'circle'|'logo', a: {lat,lng}, b?: {lat,lng}, text?, color, scale? }

export const MARK_COLORS = ['#ffffff', '#facc15', '#f97316', '#ef4444', '#e879f9', '#22d3ee', '#4ade80'];

// view: how a map location lands on this post canvas.
// snap: snapshot with toPoint/toLatLng; src: the part of the snapshot drawn
// (in snapshot pixels); area: where it's drawn on the post.
export function makeView(snap, src, area) {
  const kx = area.w / src.w;
  const ky = area.h / src.h;
  return {
    area,
    toCanvas(ll) {
      const p = snap.toPoint(ll.lat, ll.lng);
      return { x: area.x + (p.x - src.x) * kx, y: area.y + (p.y - src.y) * ky };
    },
    toLatLng(x, y) {
      const ll = snap.toLatLng(src.x + (x - area.x) / kx, src.y + (y - area.y) / ky);
      return { lat: ll.lat, lng: ll.lng };
    },
  };
}

const unit = (canvas) => canvas.width / 1080;

function labelBox(ctx, m, p, u, font) {
  const fs = Math.round(34 * u * (m.scale || 1));
  ctx.font = `700 ${fs}px ${font}`;
  const lines = String(m.text || ' ').split('\n').slice(0, 3);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + fs * 1.1;
  const lh = fs * 1.2;
  const h = lines.length * lh + fs * 0.6;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h, fs, lh, lines };
}

function logoBox(m, p, u, logoImg) {
  const max = 200 * u * (m.scale || 1);
  const k = Math.min(max / logoImg.naturalWidth, max / logoImg.naturalHeight);
  const w = logoImg.naturalWidth * k;
  const h = logoImg.naturalHeight * k;
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrowHead(ctx, a, b, len) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - len * Math.cos(ang - 0.45), b.y - len * Math.sin(ang - 0.45));
  ctx.lineTo(b.x - len * Math.cos(ang + 0.45), b.y - len * Math.sin(ang + 0.45));
  ctx.closePath();
}

// Draws the marks, kept inside the map part of the post.
export function drawMarks(canvas, marks, view, { font = 'system-ui, sans-serif', logoImg } = {}) {
  if (!marks?.length || !view) return;
  const ctx = canvas.getContext('2d');
  const u = unit(canvas);
  const { area } = view;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const m of marks) {
    const a = view.toCanvas(m.a);
    if (m.kind === 'arrow' || m.kind === 'circle') {
      const b = view.toCanvas(m.b);
      const lw = 8 * u * (m.scale || 1);
      const path = () => {
        ctx.beginPath();
        if (m.kind === 'arrow') {
          // Stop the line short of the tip so the head stays sharp.
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const back = Math.min(len, lw * 2);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x - ((b.x - a.x) / len) * back, b.y - ((b.y - a.y) / len) * back);
        } else {
          ctx.arc(a.x, a.y, Math.max(6 * u, Math.hypot(b.x - a.x, b.y - a.y)), 0, Math.PI * 2);
        }
      };
      path();
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = lw + 6 * u;
      ctx.stroke();
      if (m.kind === 'arrow') {
        arrowHead(ctx, a, b, lw * 3.6);
        ctx.lineWidth = 6 * u;
        ctx.stroke();
      }
      path();
      ctx.strokeStyle = m.color;
      ctx.lineWidth = lw;
      ctx.stroke();
      if (m.kind === 'arrow') {
        arrowHead(ctx, a, b, lw * 3.6);
        ctx.fillStyle = m.color;
        ctx.fill();
      }
    } else if (m.kind === 'label') {
      const box = labelBox(ctx, m, a, u, font);
      ctx.fillStyle = 'rgba(11,18,32,0.88)';
      rounded(ctx, box.x, box.y, box.w, box.h, 10 * u);
      ctx.fill();
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 3 * u;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      box.lines.forEach((l, i) => ctx.fillText(l, a.x, box.y + box.fs * 0.3 + box.lh * (i + 0.5)));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    } else if (m.kind === 'logo' && logoImg) {
      const box = logoBox(m, a, u, logoImg);
      ctx.drawImage(logoImg, box.x, box.y, box.w, box.h);
    }
  }
  ctx.restore();
}

// Outline of a mark on the canvas (for the selection box and tapping).
export function markBounds(canvas, m, view, { font = 'system-ui, sans-serif', logoImg } = {}) {
  const u = unit(canvas);
  const a = view.toCanvas(m.a);
  if (m.kind === 'label') {
    const ctx = canvas.getContext('2d');
    ctx.save();
    const b = labelBox(ctx, m, a, u, font);
    ctx.restore();
    return b;
  }
  if (m.kind === 'logo') return logoImg ? logoBox(m, a, u, logoImg) : { x: a.x - 20, y: a.y - 20, w: 40, h: 40 };
  const b = view.toCanvas(m.b);
  if (m.kind === 'circle') {
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 };
  }
  const pad = 14 * u;
  return { x: Math.min(a.x, b.x) - pad, y: Math.min(a.y, b.y) - pad, w: Math.abs(b.x - a.x) + pad * 2, h: Math.abs(b.y - a.y) + pad * 2 };
}

// Which mark (and which part) is under canvas point (x, y). Newest on top.
export function hitMark(canvas, marks, view, x, y, opts) {
  const u = unit(canvas);
  const near = 28 * u;
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i];
    const a = view.toCanvas(m.a);
    if (m.kind === 'arrow' || m.kind === 'circle') {
      const b = view.toCanvas(m.b);
      if (Math.hypot(x - b.x, y - b.y) < near) return { id: m.id, part: 'b' };
      if (m.kind === 'arrow') {
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / L2));
        if (Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y))) < near) return { id: m.id, part: 'all' };
      } else {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        if (Math.abs(Math.hypot(x - a.x, y - a.y) - r) < near || Math.hypot(x - a.x, y - a.y) < near) return { id: m.id, part: 'all' };
      }
    } else {
      const r = markBounds(canvas, m, view, opts);
      if (x >= r.x - 6 && x <= r.x + r.w + 6 && y >= r.y - 6 && y <= r.y + r.h + 6) return { id: m.id, part: 'all' };
    }
  }
  return null;
}
