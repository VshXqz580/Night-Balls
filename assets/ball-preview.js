import * as THREE from "./vendor/three/build/three.module.js";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

const container = document.querySelector(".ball-stage");

if (!container) {
  throw new Error("Missing .ball-stage container");
}

const DESKTOP_KEYFRAMES = [
  { x: 2.76, y: 1.42, z: 0.82, scale: 3.48 },
  { x: 2.84, y: 1.28, z: 0.8, scale: 3.34 },
  { x: 2.96, y: 1.02, z: 0.72, scale: 3.06 },
  { x: 3.08, y: 0.76, z: 0.62, scale: 2.76 },
  { x: 3.24, y: 0.56, z: 0.52, scale: 2.44 },
];

const MOBILE_KEYFRAMES = [
  { x: 0.02, y: 0.8, z: 0.34, scale: 2.44 },
  { x: 0.08, y: 0.68, z: 0.32, scale: 2.34 },
  { x: -0.08, y: 0.54, z: 0.28, scale: 2.18 },
  { x: 0.16, y: 0.4, z: 0.24, scale: 2.02 },
  { x: 0.3, y: 0.28, z: 0.2, scale: 1.88 },
];

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog("#120e0c", 10, 18);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
camera.position.set(0, 0.05, 7.6);

scene.add(new THREE.AmbientLight("#241714", 0.12));

const hemisphere = new THREE.HemisphereLight("#6a4127", "#040404", 0.26);
scene.add(hemisphere);

const warmSpot = new THREE.SpotLight("#ff9a4d", 134, 0, 0.48, 1, 1);
warmSpot.position.set(-6.4, 6.8, 5.2);
warmSpot.castShadow = true;
warmSpot.shadow.mapSize.set(2048, 2048);
warmSpot.shadow.bias = -0.00012;
scene.add(warmSpot);

const coolSpot = new THREE.SpotLight("#ffffff", 62, 0, 0.46, 1, 1);
coolSpot.position.set(6.6, 4.4, 4.4);
scene.add(coolSpot);

const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(1.2, 64),
  new THREE.ShadowMaterial({ opacity: 0.34 }),
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.set(0, -1.24, 0);
shadowPlane.scale.set(4.8, 2.2, 1);
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const rootGroup = new THREE.Group();
scene.add(rootGroup);

const mouse = new THREE.Vector2();
const clock = new THREE.Clock();

window.addEventListener("pointermove", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((event.clientY / window.innerHeight) * 2 - 1);
});

function currentKeyframes() {
  return window.innerWidth >= 1024 ? DESKTOP_KEYFRAMES : MOBILE_KEYFRAMES;
}

function lerpFrame(progress) {
  const frames = currentKeyframes();
  const maxIndex = frames.length - 1;
  const scaled = THREE.MathUtils.clamp(progress, 0, 1) * maxIndex;
  const index = Math.min(maxIndex - 1, Math.floor(scaled));
  const mix = scaled - index;
  const from = frames[index];
  const to = frames[index + 1];

  return {
    x: THREE.MathUtils.lerp(from.x, to.x, mix),
    y: THREE.MathUtils.lerp(from.y, to.y, mix),
    z: THREE.MathUtils.lerp(from.z, to.z, mix),
    scale: THREE.MathUtils.lerp(from.scale, to.scale, mix),
  };
}

function getScrollProgress() {
  const scrollable = Math.max(
    1,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  return window.scrollY / scrollable;
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

resize();
window.addEventListener("resize", resize);

const loader = new GLTFLoader();

loader.load(
  "../basketball.glb",
  (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    box.getSize(size);
    box.getCenter(center);

    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const fitScale = 1.12 / maxAxis;

    model.scale.setScalar(fitScale);
    model.position.set(
      -center.x * fitScale,
      -center.y * fitScale,
      -center.z * fitScale,
    );

    const groundedBox = new THREE.Box3().setFromObject(model);
    model.position.y -= groundedBox.min.y + 0.82;

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      if (child.material) {
        child.material.envMapIntensity = 0.34;
        child.material.toneMapped = true;
        child.material.roughness = Math.min(
          0.96,
          (child.material.roughness ?? 0.82) + 0.04,
        );
        child.material.metalness = Math.min(
          0.12,
          child.material.metalness ?? 0.05,
        );

        if (child.material.color) {
          child.material.color.multiplyScalar(1.14);
        }

        if (child.material.emissive) {
          child.material.emissive = new THREE.Color("#3d1206");
          child.material.emissiveIntensity = 0.18;
        }

        child.material.needsUpdate = true;
      }
    });

    const initial = currentKeyframes()[0];
    rootGroup.position.set(initial.x, initial.y, initial.z);
    rootGroup.scale.setScalar(initial.scale);
    rootGroup.add(model);
  },
  undefined,
  (error) => {
    console.error("Failed to load basketball model", error);
  },
);

function animate() {
  const delta = Math.min(clock.getDelta(), 0.035);
  const time = clock.elapsedTime;
  const target = lerpFrame(getScrollProgress());
  const targetRotX = -mouse.y * 0.18 + Math.sin(time * 0.55) * 0.025;
  const targetRotY = mouse.x * 0.22 + time * 0.2;
  const targetRotZ = -mouse.x * 0.05 + Math.sin(time * 0.35) * 0.018;
  const targetPosX = target.x + mouse.x * 0.08;
  const targetPosY = target.y + Math.sin(time * 0.9) * 0.04 - mouse.y * 0.06;
  const targetPosZ = target.z + Math.abs(mouse.x) * 0.02;

  rootGroup.rotation.x = THREE.MathUtils.damp(
    rootGroup.rotation.x,
    targetRotX,
    6,
    delta,
  );
  rootGroup.rotation.y = THREE.MathUtils.damp(
    rootGroup.rotation.y,
    targetRotY,
    6,
    delta,
  );
  rootGroup.rotation.z = THREE.MathUtils.damp(
    rootGroup.rotation.z,
    targetRotZ,
    5.5,
    delta,
  );

  rootGroup.position.x = THREE.MathUtils.damp(
    rootGroup.position.x,
    targetPosX,
    5.2,
    delta,
  );
  rootGroup.position.y = THREE.MathUtils.damp(
    rootGroup.position.y,
    targetPosY,
    5.2,
    delta,
  );
  rootGroup.position.z = THREE.MathUtils.damp(
    rootGroup.position.z,
    targetPosZ,
    5.2,
    delta,
  );

  rootGroup.scale.x = THREE.MathUtils.damp(
    rootGroup.scale.x,
    target.scale,
    4.8,
    delta,
  );
  rootGroup.scale.y = THREE.MathUtils.damp(
    rootGroup.scale.y,
    target.scale,
    4.8,
    delta,
  );
  rootGroup.scale.z = THREE.MathUtils.damp(
    rootGroup.scale.z,
    target.scale,
    4.8,
    delta,
  );

  renderer.render(scene, camera);
  window.requestAnimationFrame(animate);
}

animate();
