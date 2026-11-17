import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Props = {
  className?: string;
};

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const NX = 460; // particles across the width of the terrain
const NZ = 200; // particles in depth of the terrain (~92k total)
const WIDTH = 40; // world width of the terrain
const DUST = 6000; // background dust particles
const POINT_SIZE = 0.16; // world-space point size (scaled by distance)

/* ------------------------------------------------------------------ */
/*  Terrain shader: all the motion is computed on the GPU              */
/* ------------------------------------------------------------------ */
const terrainVertex = /* glsl */ `
  attribute vec2 aGrid;   // x: 0..1 across the width, y: 0..1 near -> far
  attribute vec3 aJitter; // random offset for a grainy, organic look

  uniform float uTime;
  uniform float uScale;      // pixels per world unit at distance 1
  uniform float uPointSize;  // world-space point size
  uniform float uWidth;
  uniform float uIntensity;

  varying vec3 vColor;

  // Layered sine field: a dominant ridge, secondary folds and fine ripples
  float terrain(float x, float z, float t) {
    float h = 0.0;
    h += sin(x * 0.16 + z * 0.10 + t * 0.18) * 1.90;
    h += sin(x * 0.34 - z * 0.23 + t * 0.27 + 1.3) * 1.00;
    h += sin(x * 0.71 + z * 0.52 - t * 0.36 + 2.1) * 0.42;
    h += sin(x * 1.45 - z * 1.10 + t * 0.55) * 0.14;
    h += sin(z * 0.75 + x * 0.05 + t * 0.22) * 0.90; // stacked ridges in depth
    return h;
  }

  vec3 gradient(float t) {
    vec3 c0 = vec3(0.20, 0.55, 1.00); // blue
    vec3 c1 = vec3(0.50, 0.42, 1.00); // violet
    vec3 c2 = vec3(0.95, 0.45, 0.78); // pink
    vec3 c3 = vec3(1.00, 0.55, 0.36); // orange
    vec3 c4 = vec3(1.00, 0.38, 0.32); // red
    vec3 c = mix(c0, c1, smoothstep(0.00, 0.30, t));
    c = mix(c, c2, smoothstep(0.30, 0.55, t));
    c = mix(c, c3, smoothstep(0.55, 0.80, t));
    c = mix(c, c4, smoothstep(0.80, 1.00, t));
    return c;
  }

  void main() {
    float depth = aGrid.y;                       // 0 = near, 1 = far
    float x = (aGrid.x - 0.5) * uWidth + aJitter.x * 0.04;
    float z = mix(4.0, -45.0, depth) + aJitter.z * 0.06;

    float h = terrain(x, z, uTime);
    float y = h * 0.75 - 1.8 + aJitter.y * 0.03;

    // Crest brightness: high points glow, valleys fade into the dark
    float hn = clamp((h + 1.5) / 4.5, 0.0, 1.0);
    float crest = pow(hn, 2.2);

    // Depth: near rows are dim, mid rows are the brightest, far rows recede
    float nearFade = mix(0.35, 1.0, smoothstep(0.0, 0.35, depth));
    float farFade = mix(1.0, 0.30, depth);

    // Fade the left and right edges of the terrain into the black background
    float ax = abs(x) / (uWidth * 0.5);
    float edge = 1.0 - smoothstep(0.55, 1.0, ax);

    float intensity = (0.08 + 0.92 * crest) * nearFade * farFade * edge * uIntensity;

    // Colour follows the horizontal position: blue on the left, red on the right
    float u = clamp(0.5 + x / 24.0, 0.0, 1.0);
    vec3 col = gradient(u);
    col = mix(col, vec3(1.0), crest * 0.18); // hot white-ish crest
    vColor = col * intensity;

    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uPointSize * uScale / -mv.z);
  }
`;

const terrainFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/*  Dust shader                                                        */
/* ------------------------------------------------------------------ */
const dustVertex = /* glsl */ `
  attribute vec4 aSeed; // xyz: position, w: brightness
  uniform float uTime;
  uniform float uScale;
  varying float vAlpha;

  void main() {
    vec3 p = aSeed.xyz;
    // Slow upward drift, wrapping vertically
    p.y = mod(p.y + uTime * (0.06 + aSeed.w * 0.08) + 6.0, 15.0) - 6.0;
    p.x += sin(uTime * 0.2 + aSeed.x * 3.0) * 0.12;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, (0.09 + aSeed.w * 0.07) * uScale / -mv.z);
    vAlpha = 0.20 + aSeed.w * 0.55;
  }
`;

const dustFragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.72, 0.76, 0.85) * a, 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function ParticleWave({ className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pr = Math.min(window.devicePixelRatio, 2);

    // ---------- Renderer / scene / camera ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(pr);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    const CAM_Y = 2.2;
    camera.position.set(0, CAM_Y, 10);
    camera.lookAt(0, 0.9, -10);

    // ---------- Terrain geometry (static; motion happens in the shader) ----------
    const count = NX * NZ;
    const grid = new Float32Array(count * 2);
    const jitter = new Float32Array(count * 3);
    let k = 0;
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        grid[k * 2] = i / (NX - 1);
        grid[k * 2 + 1] = j / (NZ - 1);
        jitter[k * 3] = Math.random() - 0.5;
        jitter[k * 3 + 1] = Math.random() - 0.5;
        jitter[k * 3 + 2] = Math.random() - 0.5;
        k++;
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    terrainGeo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
    terrainGeo.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 3));

    const terrainMat = new THREE.ShaderMaterial({
      vertexShader: terrainVertex,
      fragmentShader: terrainFragment,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 300 },
        uPointSize: { value: POINT_SIZE },
        uWidth: { value: WIDTH },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const terrain = new THREE.Points(terrainGeo, terrainMat);
    terrain.frustumCulled = false;
    scene.add(terrain);

    // ---------- Background dust ----------
    const dustSeed = new Float32Array(DUST * 4);
    for (let i = 0; i < DUST; i++) {
      dustSeed[i * 4] = (Math.random() - 0.5) * 60;
      dustSeed[i * 4 + 1] = Math.random() * 15 - 6;
      dustSeed[i * 4 + 2] = (Math.random() - 0.5) * 30;
      dustSeed[i * 4 + 3] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DUST * 3), 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dustSeed, 4));

    const dustMat = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 300 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    // ---------- Resize ----------
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h); // updates canvas CSS size as well
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const scale = (h * pr) / 2;
      terrainMat.uniforms.uScale.value = scale;
      dustMat.uniforms.uScale.value = scale;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ---------- Mouse parallax ----------
    const target = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointer);

    // ---------- Animation loop ----------
    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      const t = clock.getElapsedTime();
      terrainMat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;

      camera.position.x += (target.x * 1.5 - camera.position.x) * 0.03;
      camera.position.y += (CAM_Y - target.y * 0.5 - camera.position.y) * 0.03;
      camera.lookAt(0, 0.9, -10);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    // ---------- Cleanup ----------
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      terrainGeo.dispose();
      terrainMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
