// Turn a list of finished frames (canvases) into a short video, using the
// browser's own recorder: no server, no extra library. Plays the loop a few
// times and holds on the newest scan each time.

const TYPES = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export function videoType() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export async function recordVideo(frames, { frameMs = 400, holdMs = 1600, loops = 3, onProgress } = {}) {
  const type = videoType();
  if (!type) throw new Error("This browser can't record video.");
  const { width, height } = frames[0];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(frames[0], 0, 0);

  const plan = [];
  for (let l = 0; l < loops; l++) frames.forEach((_, i) => plan.push([i, i === frames.length - 1 ? holdMs : frameMs]));
  const total = plan.reduce((s, [, ms]) => s + ms, 0);

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(500);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const id = setInterval(() => {
      const t = performance.now() - t0;
      if (t >= total) {
        clearInterval(id);
        resolve();
        return;
      }
      let acc = 0;
      let idx = plan[plan.length - 1][0];
      for (const [i, ms] of plan) {
        acc += ms;
        if (t < acc) {
          idx = i;
          break;
        }
      }
      ctx.drawImage(frames[idx], 0, 0); // redraw every tick so the recorder keeps getting frames
      onProgress?.(t / total);
    }, 1000 / 30);
  });
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const mime = type.split(';')[0];
  return { blob: new Blob(chunks, { type: mime }), ext: mime === 'video/mp4' ? 'mp4' : 'webm', seconds: total / 1000 };
}
