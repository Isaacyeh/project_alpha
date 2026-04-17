import { map, getGeometry } from "../map.js";

let gl = null;
let program = null;
let worldCanvas = null;
let positionBuffer = null;
let colorBuffer = null;
let indexBuffer = null;
let indexCount = 0;
let vertexCount = 0;

const WALL_COLOR = [0.82, 0.84, 0.88];
const FLOOR_COLOR = [0.26, 0.27, 0.30];
const CEIL_COLOR = [0.14, 0.15, 0.18];

function createShader(glCtx, type, source) {
  const shader = glCtx.createShader(type);
  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);
  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    const info = glCtx.getShaderInfoLog(shader);
    glCtx.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(glCtx, vertSource, fragSource) {
  const vert = createShader(glCtx, glCtx.VERTEX_SHADER, vertSource);
  const frag = createShader(glCtx, glCtx.FRAGMENT_SHADER, fragSource);
  const prog = glCtx.createProgram();
  glCtx.attachShader(prog, vert);
  glCtx.attachShader(prog, frag);
  glCtx.linkProgram(prog);
  if (!glCtx.getProgramParameter(prog, glCtx.LINK_STATUS)) {
    const info = glCtx.getProgramInfoLog(prog);
    throw new Error(`Program link failed: ${info}`);
  }
  return prog;
}

function pushVertex(positions, colors, x, y, z, c) {
  positions.push(x, y, z);
  colors.push(c[0], c[1], c[2]);
  return vertexCount++;
}

function pushQuad(positions, colors, indices, a, b, c, d, color) {
  const ia = pushVertex(positions, colors, ...a, color);
  const ib = pushVertex(positions, colors, ...b, color);
  const ic = pushVertex(positions, colors, ...c, color);
  const id = pushVertex(positions, colors, ...d, color);
  indices.push(ia, ib, ic, ia, ic, id);
}

function addCube(positions, colors, indices, x, z, y, w, h, d, color) {
  const x0 = x;
  const x1 = x + w;
  const y0 = y;
  const y1 = y + d;
  const z0 = z;
  const z1 = z + h;

  // front
  pushQuad(positions, colors, indices, [x0, z0, y1], [x1, z0, y1], [x1, z1, y1], [x0, z1, y1], color);
  // back
  pushQuad(positions, colors, indices, [x1, z0, y0], [x0, z0, y0], [x0, z1, y0], [x1, z1, y0], color);
  // left
  pushQuad(positions, colors, indices, [x0, z0, y0], [x0, z0, y1], [x0, z1, y1], [x0, z1, y0], color);
  // right
  pushQuad(positions, colors, indices, [x1, z0, y1], [x1, z0, y0], [x1, z1, y0], [x1, z1, y1], color);
  // top
  pushQuad(positions, colors, indices, [x0, z1, y0], [x0, z1, y1], [x1, z1, y1], [x1, z1, y0], color);
}

function buildStaticWorldBuffers(glCtx) {
  const positions = [];
  const colors = [];
  const indices = [];
  vertexCount = 0;

  const mapH = map.length;
  const mapW = map[0]?.length ?? 0;

  // Floor + ceiling slabs.
  addCube(positions, colors, indices, 0, -0.05, 0, mapW, 0.05, mapH, FLOOR_COLOR);
  addCube(positions, colors, indices, 0, 1.0, 0, mapW, 0.05, mapH, CEIL_COLOR);

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const tile = map[y][x];
      const geo = getGeometry(tile);
      if (!geo || !geo.render) continue;

      if (geo.type === "pillar") {
        addCube(positions, colors, indices, x + 0.35, 0, y + 0.35, 0.3, 1, 0.3, WALL_COLOR);
      } else {
        addCube(positions, colors, indices, x, 0, y, 1, 1, 1, WALL_COLOR);
      }
    }
  }

  positionBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, positionBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(positions), glCtx.STATIC_DRAW);

  colorBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ARRAY_BUFFER, colorBuffer);
  glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array(colors), glCtx.STATIC_DRAW);

  indexBuffer = glCtx.createBuffer();
  glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, indexBuffer);
  glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), glCtx.STATIC_DRAW);

  indexCount = indices.length;
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function lookAt(eye, center, up) {
  const out = new Float32Array(16);
  let x0;
  let x1;
  let x2;
  let y0;
  let y1;
  let y2;
  let z0;
  let z1;
  let z2;
  let len;

  z0 = eye[0] - center[0];
  z1 = eye[1] - center[1];
  z2 = eye[2] - center[2];
  len = Math.hypot(z0, z1, z2);
  if (len === 0) z2 = 1;
  else {
    z0 /= len;
    z1 /= len;
    z2 /= len;
  }

  x0 = up[1] * z2 - up[2] * z1;
  x1 = up[2] * z0 - up[0] * z2;
  x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (len !== 0) {
    x0 /= len;
    x1 /= len;
    x2 /= len;
  }

  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;

  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;

  return out;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
  const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
  const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
  const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

  out[0] = b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32;
  out[3] = b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33;

  out[4] = b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30;
  out[5] = b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31;
  out[6] = b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32;
  out[7] = b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33;

  out[8] = b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30;
  out[9] = b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31;
  out[10] = b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32;
  out[11] = b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33;

  out[12] = b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30;
  out[13] = b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31;
  out[14] = b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32;
  out[15] = b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33;
  return out;
}

function initIfNeeded(hudCanvas) {
  if (gl && program && worldCanvas) return;

  worldCanvas = document.getElementById("game3d");
  if (!worldCanvas) return;

  gl = worldCanvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) {
    gl = worldCanvas.getContext("webgl", { antialias: true, alpha: false });
  }
  if (!gl) {
    console.warn("WebGL unavailable; 3D world renderer disabled.");
    return;
  }

  const vert = `
    attribute vec3 a_position;
    attribute vec3 a_color;
    uniform mat4 u_viewProj;
    varying vec3 v_color;
    void main() {
      v_color = a_color;
      gl_Position = u_viewProj * vec4(a_position, 1.0);
    }
  `;

  const frag = `
    precision mediump float;
    varying vec3 v_color;
    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `;

  program = createProgram(gl, vert, frag);
  gl.enable(gl.DEPTH_TEST);
  buildStaticWorldBuffers(gl);

  // Keep both canvases in lockstep.
  worldCanvas.width = hudCanvas.width;
  worldCanvas.height = hudCanvas.height;
}

export function renderWorld3D(hudCanvas, state) {
  initIfNeeded(hudCanvas);
  if (!gl || !program || !worldCanvas) return;

  if (worldCanvas.width !== hudCanvas.width || worldCanvas.height !== hudCanvas.height) {
    worldCanvas.width = hudCanvas.width;
    worldCanvas.height = hudCanvas.height;
  }

  gl.viewport(0, 0, worldCanvas.width, worldCanvas.height);
  gl.clearColor(0.16, 0.19, 0.24, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(program);

  const aspect = worldCanvas.width / Math.max(1, worldCanvas.height);
  const proj = perspective(Math.PI / 3, aspect, 0.05, 200);

  const eye = [state.player.x, 0.5 + state.z, state.player.y];
  const target = [
    state.player.x + Math.cos(state.player.angle),
    0.5 + state.z,
    state.player.y + Math.sin(state.player.angle),
  ];
  const view = lookAt(eye, target, [0, 1, 0]);
  const viewProj = multiply(proj, view);

  const uViewProj = gl.getUniformLocation(program, "u_viewProj");
  gl.uniformMatrix4fv(uViewProj, false, viewProj);

  const aPosition = gl.getAttribLocation(program, "a_position");
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

  const aColor = gl.getAttribLocation(program, "a_color");
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
}
