import * as THREE from 'three'

export interface ShaderPreset {
  id: string
  /** Uniforms injected into the shader */
  uniforms: Record<string, { value: unknown }>
  /** GLSL functions injected before main() in fragment shader */
  fragmentFunctions: string
  /** Code injected into <map_fragment> to override diffuseColor */
  fragmentInjection: string
  /** Code injected into vertex shader for world position varying */
  vertexInjection: string
}

// ─── GLSL noise helpers (shared by all shaders) ────────────────────────

const NOISE_HELPERS = `
float hash21_sh(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise_sh(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21_sh(i);
  float b = hash21_sh(i + vec2(1.0, 0.0));
  float c = hash21_sh(i + vec2(0.0, 1.0));
  float d = hash21_sh(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm_sh(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * valueNoise_sh(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}
`

// ─── Wood Grain ─────────────────────────────────────────────────────────

const woodGrain: ShaderPreset = {
  id: 'wood_grain',
  uniforms: {
    woodGrainFreq: { value: 28.0 },
    woodRingFreq: { value: 6.0 },
    woodColor1: { value: new THREE.Color('#8B6914') },
    woodColor2: { value: new THREE.Color('#C4A265') },
    woodDark: { value: new THREE.Color('#4A3520') },
    woodNoiseScale: { value: 4.0 },
  },
  vertexInjection: `
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  `,
  fragmentFunctions: NOISE_HELPERS + `
    vec3 woodGrainColor(vec3 wp, float grainFreq, float ringFreq, vec3 col1, vec3 col2, vec3 dark, float noiseScale) {
      vec2 p = wp.xz * noiseScale;
      float n = fbm_sh(p * 0.5);
      vec2 dp = p + vec2(n * 2.0, n * 1.5);
      float grain = sin(dp.x * grainFreq + sin(dp.y * 1.5) * 4.0) * 0.5 + 0.5;
      float dist = length(dp - vec2(5.0, 3.0));
      float rings = sin(dist * ringFreq + dp.x * 0.8 + n * 6.0) * 0.5 + 0.5;
      rings = pow(rings, 0.6);
      vec3 c = mix(col1, col2, grain * 0.6 + 0.2);
      c = mix(c, dark, (1.0 - rings) * 0.12);
      float grainLine = pow(max(0.0, sin(dp.x * grainFreq * 2.5)), 20.0);
      c = mix(c, dark, grainLine * 0.3);
      return c;
    }
  `,
  fragmentInjection: `
    vec3 _wpc = woodGrainColor(vWorldPosition, woodGrainFreq, woodRingFreq,
                                woodColor1, woodColor2, woodDark, woodNoiseScale);
    diffuseColor = vec4(_wpc, 1.0);
  `,
}

// ─── Marble Veining ─────────────────────────────────────────────────────

const marbleVein: ShaderPreset = {
  id: 'marble_vein',
  uniforms: {
    marbleScale: { value: 5.0 },
    marbleColor1: { value: new THREE.Color('#F0EDE8') },
    marbleColor2: { value: new THREE.Color('#E0D8D0') },
    marbleVeinColor: { value: new THREE.Color('#8A8078') },
    marbleVeinWidth: { value: 0.06 },
  },
  vertexInjection: `
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  `,
  fragmentFunctions: NOISE_HELPERS + `
    vec3 marbleColor(vec3 wp, float scale, vec3 col1, vec3 col2, vec3 veinCol, float veinWidth) {
      vec2 p = wp.xz * scale;
      float n1 = fbm_sh(p);
      float n2 = fbm_sh(p + vec2(5.2, 1.3));
      float n3 = fbm_sh(p * 1.5 + vec2(n1 * 3.0, n2 * 2.0));
      float vein = abs(n3 - 0.5) * 2.0;
      vein = smoothstep(veinWidth, veinWidth + 0.08, vein);
      float w = fbm_sh(p * 0.3 + 10.0);
      vec3 base = mix(col1, col2, w * 0.5 + 0.25);
      vec3 c = mix(veinCol, base, vein);
      float sheen = pow(valueNoise_sh(p * 8.0), 4.0) * 0.15;
      c += vec3(sheen);
      return c;
    }
  `,
  fragmentInjection: `
    vec3 _mvc = marbleColor(vWorldPosition, marbleScale,
                             marbleColor1, marbleColor2, marbleVeinColor, marbleVeinWidth);
    diffuseColor = vec4(_mvc, 1.0);
  `,
}

// ─── Procedural Concrete ────────────────────────────────────────────────

const concreteProc: ShaderPreset = {
  id: 'concrete_proc',
  uniforms: {
    concreteScale: { value: 8.0 },
    concreteBaseColor: { value: new THREE.Color('#A09A94') },
    concreteDarkSpots: { value: new THREE.Color('#706860') },
    concreteDensity: { value: 0.3 },
  },
  vertexInjection: `
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  `,
  fragmentFunctions: NOISE_HELPERS + `
    vec3 concreteColor(vec3 wp, float scale, vec3 baseCol, vec3 darkCol, float density) {
      vec2 p = wp.xz * scale;
      float fine = fbm_sh(p * 3.0) * 0.12 - 0.06;
      float agg = step(1.0 - density, hash21_sh(floor(p * 2.0)));
      float aggNoise = hash21_sh(floor(p * 2.0) + 0.5) * 0.15;
      vec3 c = baseCol + fine;
      c = mix(c, darkCol - aggNoise, agg * 0.35);
      float micro = valueNoise_sh(p * 15.0) * 0.04;
      c += micro - 0.02;
      return c;
    }
  `,
  fragmentInjection: `
    vec3 _ccc = concreteColor(vWorldPosition, concreteScale,
                               concreteBaseColor, concreteDarkSpots, concreteDensity);
    diffuseColor = vec4(_ccc, 1.0);
  `,
}

// ─── Stone Masonry ──────────────────────────────────────────────────────

const stoneProc: ShaderPreset = {
  id: 'stone_proc',
  uniforms: {
    stoneScale: { value: 6.0 },
    stoneColor1: { value: new THREE.Color('#8A8278') },
    stoneColor2: { value: new THREE.Color('#A09890') },
    stoneMortarColor: { value: new THREE.Color('#D0C8C0') },
    stoneBlockW: { value: 4.0 },
    stoneBlockH: { value: 3.0 },
  },
  vertexInjection: `
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  `,
  fragmentFunctions: NOISE_HELPERS + `
    vec3 stoneColor(vec3 wp, float scale, vec3 col1, vec3 col2, vec3 mortar, float bW, float bH) {
      vec2 p = wp.xz * scale;
      float row = floor(p.y * bH);
      float offset = mod(row, 2.0) * 0.5;
      vec2 bp = vec2((p.x + offset) * bW, p.y * bH);
      vec2 cell = floor(bp);
      vec2 f = fract(bp);
      float hv = step(0.92, f.x) + step(0.92, 1.0 - f.x);
      float vv = step(0.92, f.y) + step(0.92, 1.0 - f.y);
      float isMortar = min(1.0, hv + vv);
      float seed = hash21_sh(cell);
      float variation = seed * 0.3 - 0.15;
      float n = fbm_sh(p * 2.0) * 0.08;
      vec3 stone = mix(col1, col2, seed) + variation + n;
      return mix(stone, mortar, isMortar);
    }
  `,
  fragmentInjection: `
    vec3 _sc = stoneColor(vWorldPosition, stoneScale,
                           stoneColor1, stoneColor2, stoneMortarColor, stoneBlockW, stoneBlockH);
    diffuseColor = vec4(_sc, 1.0);
  `,
}

// ─── Registry ───────────────────────────────────────────────────────────

const shaderPresets: Record<string, ShaderPreset> = {
  wood_grain: woodGrain,
  marble_vein: marbleVein,
  concrete_proc: concreteProc,
  stone_proc: stoneProc,
}

/**
 * Create a MeshStandardMaterial with a procedural shader applied.
 * Returns null if the preset ID is not a shader preset.
 */
export function createShaderMaterial(presetId: string): THREE.MeshStandardMaterial | null {
  const preset = shaderPresets[presetId]
  if (!preset) return null

  const uniforms: Record<string, THREE.IUniform> = {}
  for (const [key, val] of Object.entries(preset.uniforms)) {
    uniforms[key] = { value: val.value } as THREE.IUniform
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide,
  })

  mat.onBeforeCompile = (shader) => {
    // Copy uniforms into the shader
    for (const [key, val] of Object.entries(uniforms)) {
      shader.uniforms[key] = val
    }

    // Vertex shader: add world position varying
    shader.vertexShader = shader.vertexShader.replace(
      'void main()',
      `varying vec3 vWorldPosition;\nvoid main()`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n    ${preset.vertexInjection.trim()}`,
    )

    // Fragment shader: add functions, varying, and injection
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main()',
      `${preset.fragmentFunctions}\nvarying vec3 vWorldPosition;\nvoid main()`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n${preset.fragmentInjection}`,
    )
  }

  mat.customProgramCacheKey = () => presetId

  return mat
}

/**
 * Check if a preset ID corresponds to a shader-based material.
 */
export function isShaderPreset(presetId: string): boolean {
  return presetId in shaderPresets
}
