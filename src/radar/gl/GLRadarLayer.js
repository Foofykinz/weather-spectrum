// Radar drawn by the graphics chip (WebGL2).
//
// The decoded scan itself (range bins x radials) goes to the GPU as a
// texture. For every screen pixel, a small shader program does exactly what
// the CPU renderer does: find the pixel's latitude/longitude, its ground
// distance and azimuth from the radar, convert to slant range with the same
// 4/3-Earth beam model, pick that exact range bin and color it from the
// official color table. No smoothing or interpolation: every pixel is a real
// bin value. Because it's redrawn for each frame on screen, zooming and
// panning stay sharp, and loop frames switch instantly.
//
// One canvas covers the map view; several scans (loop frames) can be loaded
// and switched with setIndex(). Falls back to the CPU renderer when WebGL2
// isn't available (see glRadarSupported).

import L from 'leaflet';
import { buildLut } from '../level3/render';

const VERT = `#version 300 es
void main() {
  // one triangle that covers the whole canvas
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp isampler2D;
uniform usampler2D uData;   // level per (bin, radial)
uniform isampler2D uAz;     // 0.1 deg azimuth step -> radial index (-1 = none)
uniform sampler2D uLut;     // level -> color
uniform vec2 uOrigin;       // world pixel (CSS px) of the canvas top-left
uniform float uWorld;       // world size in CSS px at this zoom
uniform float uDpr;
uniform float uHeight;      // canvas height in device px
uniform vec2 uRadar;        // radar lat, lon (deg)
uniform float uElev;        // elevation angle (deg)
uniform float uBinKm;
uniform float uFirstBin;
uniform int uNbins;
out vec4 outColor;
const float PI = 3.141592653589793;
const float RAD = PI / 180.0;
const float EARTH = 6371.0;
const float KE = 6371.0 * 4.0 / 3.0;
void main() {
  vec2 css = vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) / uDpr;
  vec2 w = uOrigin + css;
  float lon = w.x / uWorld * 360.0 - 180.0;
  float lat = atan(sinh(PI * (1.0 - 2.0 * w.y / uWorld))) / RAD;
  float p1 = uRadar.x * RAD;
  float p2 = lat * RAD;
  float dp = p2 - p1;
  float dl = (lon - uRadar.y) * RAD;
  float sdp = sin(dp * 0.5);
  float sdl = sin(dl * 0.5);
  // haversine: precise at short range, unlike acos in 32-bit floats
  float a = sdp * sdp + cos(p1) * cos(p2) * sdl * sdl;
  float km = 2.0 * EARTH * asin(min(1.0, sqrt(a)));
  float phi = km / KE;
  float slant = KE * sin(phi) / cos(uElev * RAD + phi);
  int bin = int(floor(slant / uBinKm - uFirstBin)); // uFirstBin may be fractional (Level II)
  if (bin < 0 || bin >= uNbins) discard;
  // azimuth, written to stay precise near the radar
  float y = sin(dl) * cos(p2);
  float x = sin(dp) + 2.0 * sin(p1) * cos(p2) * sdl * sdl;
  float az = atan(y, x) / RAD;
  if (az < 0.0) az += 360.0;
  int ai = int(floor(az * 10.0)) % 3600;
  int rad = texelFetch(uAz, ivec2(ai, 0), 0).r;
  if (rad < 0) discard;
  uint level = texelFetch(uData, ivec2(bin, rad), 0).r;
  if (level == 0u) discard;
  vec4 c = texelFetch(uLut, ivec2(int(level), 0), 0);
  if (c.a == 0.0) discard;
  outColor = c;
}`;

export { glRadarSupported } from './support';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
  return s;
}

export const GLRadarLayer = L.Layer.extend({
  options: { pane: 'radar', opacity: 1, attribution: null },

  initialize(radials, options) {
    L.setOptions(this, options);
    this._radials = radials;
    this._index = 0;
  },

  getAttribution() {
    return this.options.attribution;
  },

  onAdd(map) {
    const canvas = (this._canvas = L.DomUtil.create('canvas', 'ws-radar-gl'));
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.opacity = this.options.opacity;
    if (map._zoomAnimated) L.DomUtil.addClass(canvas, 'leaflet-zoom-animated');
    this.getPane().appendChild(canvas);
    const gl = (this._gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }));
    const prog = (this._prog = gl.createProgram());
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    this._u = {};
    for (const n of ['uData', 'uAz', 'uLut', 'uOrigin', 'uWorld', 'uDpr', 'uHeight', 'uRadar', 'uElev', 'uBinKm', 'uFirstBin', 'uNbins']) {
      this._u[n] = gl.getUniformLocation(prog, n);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this._frames = this._radials.map((r) => this._upload(r));
    this._redraw();
    setTimeout(() => this.fire('load'), 0);
  },

  onRemove() {
    cancelAnimationFrame(this._raf);
    this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this._canvas?.remove();
    this._canvas = this._gl = null;
  },

  getEvents() {
    const ev = { move: this._schedule, zoom: this._schedule, viewreset: this._schedule, resize: this._schedule, moveend: this._schedule };
    if (this._map._zoomAnimated) ev.zoomanim = this._animateZoom;
    return ev;
  },

  setOpacity(o) {
    this.options.opacity = o;
    if (this._canvas) this._canvas.style.opacity = o;
    return this;
  },

  setIndex(i) {
    if (i === this._index) return this;
    this._index = i;
    if (this._gl) this._draw();
    return this;
  },

  _upload(r) {
    const gl = this._gl;
    const tex = (unit, internal, format, type, w, h, data) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
      return t;
    };
    const lut = new Uint8Array(buildLut(r, r.colors).buffer);
    return {
      r,
      data: tex(0, gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE, r.nbins, r.nrad, r.data),
      az: tex(1, gl.R16I, gl.RED_INTEGER, gl.SHORT, 3600, 1, r.azTable),
      lut: tex(2, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 256, 1, lut),
    };
  },

  _schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this._redraw();
    });
  },

  // Size and place the canvas over the current view, then draw.
  _redraw() {
    const map = this._map;
    if (!map || !this._gl) return;
    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(size.x * dpr);
    const h = Math.round(size.y * dpr);
    const c = this._canvas;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      c.style.width = `${size.x}px`;
      c.style.height = `${size.y}px`;
    }
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(c, topLeft);
    this._topLeft = map.layerPointToLatLng(topLeft);
    this._origin = topLeft.add(map.getPixelOrigin());
    this._worldSize = 256 * 2 ** map.getZoom();
    this._dpr = dpr;
    this._draw();
  },

  _draw() {
    const gl = this._gl;
    const f = this._frames[this._index];
    if (!gl || !f || !this._origin) return;
    const { r } = f;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this._prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, f.data);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, f.az);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, f.lut);
    const u = this._u;
    gl.uniform1i(u.uData, 0);
    gl.uniform1i(u.uAz, 1);
    gl.uniform1i(u.uLut, 2);
    gl.uniform2f(u.uOrigin, this._origin.x, this._origin.y);
    gl.uniform1f(u.uWorld, this._worldSize);
    gl.uniform1f(u.uDpr, this._dpr);
    gl.uniform1f(u.uHeight, gl.drawingBufferHeight);
    gl.uniform2f(u.uRadar, r.lat, r.lon);
    gl.uniform1f(u.uElev, r.elevation);
    gl.uniform1f(u.uBinKm, r.binKm);
    gl.uniform1f(u.uFirstBin, r.firstBin);
    gl.uniform1i(u.uNbins, r.nbins);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  // During Leaflet's animated zoom, stretch the last picture like other
  // layers do; the sharp redraw follows when the zoom finishes.
  _animateZoom(e) {
    if (!this._topLeft) return;
    const scale = this._map.getZoomScale(e.zoom);
    const pos = this._map._latLngToNewLayerPoint(this._topLeft, e.zoom, e.center);
    L.DomUtil.setTransform(this._canvas, pos, scale);
  },
});
