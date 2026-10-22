import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

// Final grade, applied after tone mapping (so values here are display-space):
// whiteout to fog for stage cuts, slight edge aberration, vignette and film grain.
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWhite: { value: 0 },
    // Display-space colour: stored as-is, no sRGB-to-linear conversion.
    uWhiteColor: { value: new THREE.Color().setHex(0xe3e6eb, THREE.LinearSRGBColorSpace) },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.32 },
    uAberration: { value: 0.006 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWhite;
    uniform vec3 uWhiteColor;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 4.0;
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b
      );
      col *= 1.0 - uVignette * smoothstep(0.12, 0.6, r2);
      col = mix(col, uWhiteColor, uWhite);
      float g = hash(floor(vUv * uRes) + floor(fract(uTime * 0.5) * 240.0)) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
}

export type Post = ReturnType<typeof createPost>

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, bloomOn: boolean) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.45, 1.15)
  bloom.enabled = bloomOn
  composer.addPass(bloom)

  composer.addPass(new OutputPass())

  const final = new ShaderPass(FinalShader)
  composer.addPass(final)

  return {
    composer,
    bloom,
    final,
    setSize(w: number, h: number, dpr: number) {
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
      final.uniforms.uRes.value.set(w * dpr, h * dpr)
    },
  }
}
