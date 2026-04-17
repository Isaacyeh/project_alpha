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
  glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), glCtx.STATIC_DRAW);

  indexCount = indices.length;
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function lookAt(eye, center, up) {
  const zx = eye[0] - center[0];
  const zy = eye[1] - center[1];
  const zz = eye[2] - center[2];
  const zLen = Math.hypot(zx, zy, zz) || 1;
  const zxN = zx / zLen;
  const zyN = zy / zLen;
  const zzN = zz / zLen;

  const xx = up[1] * zzN - up[2] * zyN;
  const xy = up[2] * zxN - up[0] * zzN;
  const xz = up[0] * zyN - up[1] * zxN;
  const xLen = Math.hypot(xx, xy, xz) || 1;
  const x0 = xx / xLen;
  const x1 = xy / xLen;
  const x2 = xz / xLen;

  const y0 = zyN * x2 - zzN * x1;
  const y1 = zzN * x0 - zxN * x2;
  const y2 = zxN * x1 - zyN * x0;

  return new Float32Array([
    x0, y0, zxN, 0,
    x1, y1, zyN, 0,
    x2, y2, zzN, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(zxN * eye[0] + zyN * eye[1] + zzN * eye[2]),
    1,
  ]);
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j + i * 4] =
        a[i * 4] * b[j] +
        a[i * 4 + 1] * b[j + 4] +
        a[i * 4 + 2] * b[j + 8] +
        a[i * 4 + 3] * b[j + 12];
    }
  }
  return out;
}

function initIfNeeded(hudCanvas) {
  if (gl && program && worldCanvas) return;

  worldCanvas = document.getElementById("game3d");
  if (!worldCanvas) return;

  gl = worldCanvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) {
    console.warn("WebGL2 unavailable; 3D world renderer disabled.");
    return;
  }

  const vert = `#version 300 es
    precision mediump float;
    layout(location = 0) in vec3 a_position;
    layout(location = 1) in vec3 a_color;
    uniform mat4 u_viewProj;
    out vec3 v_color;
    void main() {
      v_color = a_color;
      gl_Position = u_viewProj * vec4(a_position, 1.0);
    }
  `;

  const frag = `#version 300 es
    precision mediump float;
    in vec3 v_color;
    out vec4 outColor;
    void main() {
      outColor = vec4(v_color, 1.0);
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
  gl.clearColor(0.08, 0.09, 0.11, 1);
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

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
}
