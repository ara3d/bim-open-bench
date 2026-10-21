// The camera path the `view` suite plays in every pane after a load,
// and the fixed viewpoints it screenshots. Shared by every pane, as pane.mjs is.
//
//   installCameraPath({ camera, win })
//
// `camera` is the pane's adapter to its viewer, in the viewer's own world:
//   box()               -> { min: [x, y, z], max: [x, y, z] } of the loaded model, or null
//   up()                -> [x, y, z], the viewer's up axis (camera.up)
//   set(eye, target)    -> void or a promise; places the camera and makes the viewer draw
//
// The path is defined relative to the model's box, so every viewer flies the same route whatever
// its axes and origin: positions are the box centre plus offsets scaled by R, the half diagonal,
// in a frame made from the viewer's up axis. Messages from the parent page:
//   { type: "camera-path" }            -> plays the path, replies { type: "path-result", ... }
//   { type: "camera-pose", name }      -> places a viewpoint, replies { type: "posed", name } after two frames
//
// Frame times are requestAnimationFrame intervals in the pane, measured the same way for every
// viewer. Chrome must run without vsync and frame-rate limit for them to show more than 60 fps
// (scripts/view.mjs adds the flags with --path).

export const PATH_MS = 20000;

const DEG = Math.PI / 180;
const ease = (s) => s * s * (3 - 2 * s);
const clamp01 = (s) => Math.min(1, Math.max(0, s));

// Pose at time t (ms) along the path: azimuth and elevation in degrees, distance in R,
// look = target offset from the box centre in R (along e1, e2, up).
export function poseAt(t) {
  const sec = t / 1000;
  if (sec < 10) return { az: 36 * sec, el: 25, dist: 1.6, look: [0, 0, 0] }; // a full turn outside
  if (sec < 15) { // dive in towards the centre while turning a quarter
    const s = ease(clamp01((sec - 10) / 5));
    return { az: 360 + 90 * s, el: 25 - 20 * s, dist: 1.6 - 1.35 * s, look: [0, 0, 0] };
  }
  const s = ease(clamp01((sec - 15) / 5)); // inside: look around half a turn
  return { az: 450 + 180 * s, el: 5, dist: 0.25, look: [0, 0, 0] };
}

export const VIEWPOINTS = {
  iso: { az: 45, el: 30, dist: 1.6, look: [0, 0, 0] },
  front: { az: 0, el: 5, dist: 1.5, look: [0, 0, 0] },
  inside: { az: 30, el: 5, dist: 0.25, look: [0, 0, 0] },
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / (Math.hypot(...a) || 1));

// Eye and target in the viewer's world for a pose.
export function toWorld(pose, box, upAxis) {
  const u = norm(upAxis);
  const ref = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(sub(ref, mul(u, dot(ref, u))));
  const e2 = cross(u, e1);
  const center = mul(add(box.min, box.max), 0.5);
  const R = Math.hypot(...sub(box.max, box.min)) / 2 || 1;
  const target = add(center, mul(add(add(mul(e1, pose.look[0]), mul(e2, pose.look[1])), mul(u, pose.look[2])), R));
  const az = pose.az * DEG, el = pose.el * DEG;
  const dir = add(mul(add(mul(e1, Math.cos(az)), mul(e2, Math.sin(az))), Math.cos(el)), mul(u, Math.sin(el)));
  return { eye: add(target, mul(dir, pose.dist * R)), target };
}

const frame = (win) => new Promise((r) => win.requestAnimationFrame(r));

function stats(frames) {
  const v = [...frames].sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  const total = frames.reduce((a, b) => a + b, 0);
  return {
    frames: frames.length, ms: Math.round(total), fps: Math.round((frames.length / total) * 1000 * 10) / 10,
    p50: q(0.5), p95: q(0.95), p99: q(0.99), max: v.at(-1),
    over33: frames.filter((f) => f > 33.4).length, over100: frames.filter((f) => f > 100).length,
  };
}

async function playPath(win, camera) {
  const box = camera.box();
  if (!box) return { error: "no model box" };
  const up = camera.up();
  const frames = [];
  let last = await frame(win);
  const start = last;
  for (;;) {
    const t = last - start;
    if (t > PATH_MS) break;
    const { eye, target } = toWorld(poseAt(t), box, up);
    await camera.set(eye, target);
    const now = await frame(win);
    frames.push(Math.round((now - last) * 100) / 100);
    last = now;
  }
  const r = (x) => Math.round(x * 1000) / 1000;
  return { stats: stats(frames), box: { min: box.min.map(r), max: box.max.map(r) }, up, frames };
}

async function pose(win, camera, name) {
  const box = camera.box();
  if (!box || !VIEWPOINTS[name]) return;
  const { eye, target } = toWorld(VIEWPOINTS[name], box, camera.up());
  await camera.set(eye, target);
  await frame(win);
  await frame(win);
}

export function installCameraPath({ camera, win = window }) {
  const post = (msg) => { if (win.parent && win.parent !== win) win.parent.postMessage(msg, "*"); };
  win.addEventListener("message", async (e) => {
    const m = e.data;
    try {
      if (m?.type === "camera-path") post({ type: "path-result", ...(await playPath(win, camera)) });
      if (m?.type === "camera-pose") { await pose(win, camera, m.name); post({ type: "posed", name: m.name }); }
    } catch (err) {
      post({ type: m?.type === "camera-path" ? "path-result" : "posed", name: m?.name, error: String(err?.message ?? err) });
    }
  });
  // For scripts/view.mjs, which calls these through Runtime.evaluate.
  win.__benchCamera = { playPath: () => playPath(win, camera), pose: (name) => pose(win, camera, name) };
}
