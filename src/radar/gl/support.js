// Whether radar can be drawn by the graphics chip (WebGL2). Kept apart from
// GLRadarLayer so data modules can ask without loading the map library.
// ?gl=0 in the page address turns GPU drawing off (for comparison).
let supported = null;
export function glRadarSupported() {
  if (supported !== null) return supported;
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('gl') === '0') return (supported = false);
    const gl = document.createElement('canvas').getContext('webgl2');
    supported = !!gl && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}
