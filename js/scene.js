// ============================================================
// SCENE.JS — Three.js renderer, scene, camera, cinematic lighting
// ============================================================

// --- Renderer & Scene ---
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas'),
  antialias: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.useLegacyLights = false;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 4, 10);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// --- Lighting ---
// Ambient (very low - let the hemisphere and sun do the work)
const ambientLight = new THREE.AmbientLight(0xfff0e8, 0.4);
scene.add(ambientLight);

// Sun (directional with high-res shadow)
const sunLight = new THREE.DirectionalLight(0xfff8f0, 2.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 600;
sunLight.shadow.camera.left   = -150;
sunLight.shadow.camera.right  =  150;
sunLight.shadow.camera.top    =  150;
sunLight.shadow.camera.bottom = -150;
sunLight.shadow.bias = -0.0002;
sunLight.shadow.normalBias = 0.04;
scene.add(sunLight);

// Hemisphere (sky/ground fill)
const hemiLight = new THREE.HemisphereLight(0x9eceff, 0x60844d, 0.7);
scene.add(hemiLight);

// Fill light (soft fill from front-right to reduce harsh shadows)
const fillLight = new THREE.DirectionalLight(0xb0d4ff, 0.35);
fillLight.position.set(30, 20, 40);
scene.add(fillLight);

// ============================================================
// SKY — atmospheric scattering shader (Preetham-inspired)
// ============================================================
const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    topColor:    { value: new THREE.Color(0x0a2a6e) },
    midColor:    { value: new THREE.Color(0x87CEEB) },
    horizonColor:{ value: new THREE.Color(0xc9e8f5) },
    bottomColor: { value: new THREE.Color(0x4a7c3f) },
    sunDir:      { value: new THREE.Vector3(0, 1, 0) },
    sunColor:    { value: new THREE.Color(1.0, 0.97, 0.85) },
    sunSize:     { value: 0.998 },       // cos(angle) — larger = smaller disc
    fogBlend:    { value: 0.0 },
    timeOfDay:   { value: 0.5 },
  },
  vertexShader: `
    varying vec3 vWorldDir;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldDir = normalize(wp.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 horizonColor;
    uniform vec3 bottomColor;
    uniform vec3 sunDir;
    uniform vec3 sunColor;
    uniform float sunSize;
    uniform float fogBlend;
    uniform float timeOfDay;
    varying vec3 vWorldDir;

    void main() {
      vec3 d = normalize(vWorldDir);
      float h = d.y; // -1 (down) to +1 (up)

      // Exponential scattering (realistic atmospheric sky curve)
      float t = max(0.0, h);
      float expBlend = 1.0 - exp(-t * 2.8);
      vec3 sky = mix(horizonColor, topColor, expBlend);

      // Sun disc
      float sunDot = dot(d, normalize(sunDir));
      float sunDisc = smoothstep(sunSize, sunSize + 0.0008, sunDot);
      
      // Corona / Glow (Mie scattering approximation)
      float corona = pow(max(0.0, sunDot), 150.0) * 0.5 + pow(max(0.0, sunDot), 20.0) * 0.3;
      
      vec3 finalColor = sky + sunColor * sunDisc + sunColor * corona;

      // Horizon haze (adds atmospheric depth and covers geometry seams slightly)
      float haze = exp(-abs(h) * 12.0);
      finalColor = mix(finalColor, vec3(0.92, 0.95, 0.98), haze * 0.35);

      if (h < 0.0) {
        float t2 = clamp(-h * 2.0, 0.0, 1.0);
        finalColor = mix(finalColor, bottomColor, t2);
      }

      // Dithering to prevent color banding in smooth gradients
      finalColor += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyMesh);

// --- Sun disc mesh (visible bright sphere at sun position) ---
const sunDiscMesh = new THREE.Mesh(
  new THREE.SphereGeometry(6, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfffde0 })
);
scene.add(sunDiscMesh);

// --- Stars ---
const starCount = 800;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const phi = Math.random() * Math.PI;
  const theta = Math.random() * Math.PI * 2;
  const r = 1800;
  starPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
  starPos[i*3+1] = Math.abs(r * Math.cos(phi));
  starPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1.8,
  sizeAttenuation: false,
  transparent: true,
  opacity: 0.0,
});
const starPoints = new THREE.Points(starGeo, starMat);
scene.add(starPoints);

// Moon
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(10, 20, 20),
  new THREE.MeshBasicMaterial({ color: 0xdde8f0 })
);
moonMesh.visible = false;
scene.add(moonMesh);

// ============================================================
// Sky / Lighting update per frame
// ============================================================
function updateSky(timeOfDay, biome) {
  const b = BIOMES[biome];
  // Sun angle: 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  const sunH = Math.sin(angle);
  const sunX = Math.cos(angle) * 400;
  const sunY = Math.max(sunH * 350, -80);
  const sunZ = -100;

  sunLight.position.set(sunX, sunY, sunZ);
  skyMesh.position.set(0, 0, 0); // keep sky centered

  // Sun direction for shader
  const sunDir = new THREE.Vector3(sunX, sunY, sunZ).normalize();
  skyMat.uniforms.sunDir.value.copy(sunDir);
  skyMat.uniforms.timeOfDay.value = timeOfDay;

  // Sun disc mesh
  sunDiscMesh.position.set(sunX * 3.5, sunY * 3.5, sunZ * 3.5);
  sunDiscMesh.visible = sunH > -0.05;

  const t = Math.max(0, Math.min(sunH, 1));

  if (sunH > 0) {
    // Daytime
    sunLight.intensity = Math.max(0, t * 2.2);
    ambientLight.intensity = 0.18 + t * 0.42;
    hemiLight.intensity = 0.25 + t * 0.5;
    fillLight.intensity = 0.2 + t * 0.35;

    // Sunrise (0.18–0.32)
    if (timeOfDay > 0.18 && timeOfDay < 0.30) {
      sunLight.color.setHex(0xff7722);
      ambientLight.color.setHex(0xffcc88);
      skyMat.uniforms.topColor.value.setHex(0x1a2a6e);
      skyMat.uniforms.horizonColor.value.setHex(0xff9955);
      skyMat.uniforms.sunColor.value.setRGB(1.0, 0.65, 0.25);
      sunDiscMesh.material.color.setHex(0xff8833);
    }
    // Sunset (0.70–0.82)
    else if (timeOfDay > 0.70 && timeOfDay < 0.82) {
      sunLight.color.setHex(0xff5522);
      ambientLight.color.setHex(0xffaa77);
      skyMat.uniforms.topColor.value.setHex(0x0d1a4a);
      skyMat.uniforms.horizonColor.value.setHex(0xff6633);
      skyMat.uniforms.sunColor.value.setRGB(1.0, 0.45, 0.1);
      sunDiscMesh.material.color.setHex(0xff6622);
    }
    // Midday / normal
    else {
      sunLight.color.copy(b.sunColor ? new THREE.Color(b.sunColor) : new THREE.Color(0xfff8f0));
      ambientLight.color.setHex(b.ambientColor || 0xfff0e8);
      skyMat.uniforms.topColor.value.copy(b.skyTop);
      skyMat.uniforms.horizonColor.value.copy(b.skyHorizon);
      skyMat.uniforms.sunColor.value.setRGB(1.0, 0.97, 0.88);
      sunDiscMesh.material.color.setHex(0xfffde0);
    }

    starMat.opacity = 0;
    moonMesh.visible = false;
  } else {
    // Night
    sunLight.intensity = 0;
    fillLight.intensity = 0;
    ambientLight.intensity = 0.04;
    ambientLight.color.setHex(0x1a2a44);
    hemiLight.intensity = 0.06;
    hemiLight.color.setHex(0x0a1535);

    skyMat.uniforms.topColor.value.setHex(0x010209);
    skyMat.uniforms.horizonColor.value.setHex(0x04091c);
    skyMat.uniforms.sunColor.value.setRGB(0, 0, 0);

    starMat.opacity = Math.min(1.0, -sunH * 5);
    moonMesh.visible = true;
    const moonAngle = angle + Math.PI;
    moonMesh.position.set(
      Math.cos(moonAngle) * 1400,
      Math.abs(Math.sin(moonAngle)) * 800 + 80,
      -300
    );
    sunDiscMesh.visible = false;
  }

  skyMat.uniforms.bottomColor.value.setHex(b.groundColor);
  hemiLight.groundColor.setHex(b.groundColor);

  // Exponential-squared fog for realism (thicker near ground)
  scene.fog = new THREE.Fog(b.fogColor, G.fogNear, G.fogFar);
}

// ============================================================
// Camera — cinematic follow with spring damping
// ============================================================
let camTarget = new THREE.Vector3();
let camPos = new THREE.Vector3(0, 5, 12);
let _camVel = new THREE.Vector3();

// Chase offset is tuned against a 16:9-ish desktop frame. Vertical FOV is
// fixed, so a narrow portrait phone screen gets a much narrower horizontal
// FOV — the car (fixed real-world width) then eats most of the frame width.
// Pulling the camera back on narrow aspects keeps the car's on-screen size
// roughly consistent across desktop and phone portrait.
const CHASE_REF_ASPECT = 16 / 9;
function chaseDistanceScale(aspect) {
  return Math.min(3.5, Math.max(1, CHASE_REF_ASPECT / aspect));
}

function updateCamera(carPos, carQuat) {
  let offset;
  if (G.cameraMode === 'FPP') {
    // Driver seat: slightly left, slightly lower so roof feels higher, forward in cabin
    offset = new THREE.Vector3(-0.4, 1.15, 0.1);
  } else {
    // Camera offset: close chase cam, just above and behind the car
    // (tuned to match slowroads.io's framing — car fills ~28% of frame width)
    offset = new THREE.Vector3(0, 1.55, 4.3).multiplyScalar(chaseDistanceScale(camera.aspect));
  }
  offset.applyQuaternion(carQuat);
  camTarget.copy(carPos).add(offset);

  // Spring damping (critically damped, no oscillation)
  if (G.cameraMode === 'FPP') {
    camPos.copy(camTarget); // Instant snap, no lag inside cabin
  } else {
    // Frame-rate independent smoothing. An exponential follow has a steady-
    // state lag of (carSpeed * tau) behind a constantly-moving target — at
    // this game's ~80 units/s top speed, the old tau=0.2 meant the camera
    // trailed ~16 units back while driving, even though it looked right
    // sitting still. Small tau keeps that lag under ~1 unit at top speed
    // (matches slowroads.io's tight, glued-to-the-car chase cam) while still
    // smoothing out small bumps from road curvature.
    camPos.lerp(camTarget, 1 - Math.exp(-G.delta / 0.015));
  }

  camera.position.copy(camPos);

  if (G.cameraMode === 'FPP') {
    // Look straight ahead from driver's perspective
    const lookAt = carPos.clone().add(new THREE.Vector3(-0.4, 1.25, -20).applyQuaternion(carQuat));
    camera.lookAt(lookAt);
  } else {
    // Look slightly above car center for better composition
    const lookAt = carPos.clone().add(new THREE.Vector3(0, 0.8, 0));
    camera.lookAt(lookAt);
  }
}

// ============================================================
// Street Lights — Dynamically pooled lights tracking the road
// ============================================================
const STR_LIGHT_COUNT = 8;
const streetLights = [];
for (let i = 0; i < STR_LIGHT_COUNT; i++) {
  // Warm sodium/LED mix color
  const pl = new THREE.PointLight(0xffeedd, 0, 90, 2.0);
  pl.position.set(0, -1000, 0); // Hide initially
  scene.add(pl);
  streetLights.push(pl);
}

function updateStreetLights(carPos, timeOfDay) {
  const angle = (timeOfDay - 0.25) * Math.PI * 2;
  const sunH = Math.sin(angle);
  const isNight = sunH < 0.15;
  
  if (!isNight) {
    streetLights.forEach(l => l.intensity = 0);
    return;
  }
  
  // Fade in smoothly at dusk
  let lightFactor = Math.min(1.0, (0.15 - sunH) / 0.15);
  // High intensity due to PBR dropoff from 8m tall pole
  const maxIntensity = 2500.0; 

  let positions = [];
  try { positions = Road.getLightPositions(); } catch(e) {}
  if (!positions || positions.length === 0) return;

  // Find the closest light positions to the car
  const dists = positions.map(p => ({ p: p, d: p.distanceToSquared(carPos) }));
  
  // Sort by closest
  dists.sort((a,b) => a.d - b.d);

  for (let i = 0; i < STR_LIGHT_COUNT; i++) {
    if (i < dists.length) {
      streetLights[i].position.copy(dists[i].p);
      streetLights[i].intensity = lightFactor * maxIntensity;
    } else {
      streetLights[i].intensity = 0;
    }
  }
}

