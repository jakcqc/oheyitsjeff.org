export const GlowShader = {
  uniforms: {
    tDiffuse:    { value: null },   // the rendered scene
    glowStrength:{ value: 5.15 },   // subtle glow
    time:         { value: 0.0 }    // for mirage movement
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float glowStrength;
    uniform float time;
    varying vec2 vUv;

    void main() {
      // fetch resolution
      vec2 res = vec2(textureSize(tDiffuse, 0));
      vec2 invRes = 1.0 / res;

      // mirage distortion: subtle horizontal wave
      vec2 uv = vUv ;

      // original color at distorted uv
      vec4 orig = texture2D(tDiffuse, uv);

      // very slight two-sample blur for soft glow
      vec4 sampleOffset = texture2D(tDiffuse, uv + invRes * 5.5);
      vec4 glowSample = mix(orig, sampleOffset, 0.2);

      // blend original with glow sample
      gl_FragColor = mix(orig, glowSample, glowStrength);
    }
  `
};