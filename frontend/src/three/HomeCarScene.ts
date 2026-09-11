/**
 * TGR × F1 — Homepage Cinematic 3D Car Scene
 *
 * Dedicated Three.js scene for the homepage hero section.
 * Loads the F2 car GLB model with cinematic lighting, camera animation,
 * mouse-based parallax, scroll-driven orbit, and dramatic intro sequence.
 *
 * NOT related to the existing HeroTyreScene (which renders the single wheel).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/* ────────────────────────────────────────────── */
/*  Types                                         */
/* ────────────────────────────────────────────── */

export interface HomeCarSceneCallbacks {
  onProgress?: (pct: number) => void;
  onLoaded?: () => void;
  onError?: (msg: string) => void;
}

/* ────────────────────────────────────────────── */
/*  Easing helpers                                */
/* ────────────────────────────────────────────── */

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function easeOutQuart(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 4);
}

/* ────────────────────────────────────────────── */
/*  HomeCarScene                                  */
/* ────────────────────────────────────────────── */

export class HomeCarScene {
  /* ── Core Three.js ── */
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private animId: number | null = null;
  private isDestroyed = false;

  /* ── Model ── */
  private carGroup = new THREE.Group();
  private modelLoaded = false;

  /* ── Lighting ── */
  private ambientLight!: THREE.AmbientLight;
  private mainLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;
  private redRimLight!: THREE.PointLight;
  private blueAccentLight!: THREE.PointLight;
  private redSweepSpot!: THREE.SpotLight;

  /* ── Particles ── */
  private particles!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleSpeeds!: Float32Array;

  /* ── State ── */
  private introRunning = false;
  private introStart = 0;
  private scrollProg = 0;          // 0 → 1
  private mouseNX = 0;             // normalised -1 → 1
  private mouseNY = 0;
  private smoothMX = 0;
  private smoothMY = 0;

  /* ── Camera anchors ── */
  private readonly CAM_INITIAL = new THREE.Vector3(22, 9, 22);
  private readonly CAM_HERO    = new THREE.Vector3(7.5, 2.8, 6.5);
  private readonly CAM_LOOK    = new THREE.Vector3(0, 0.6, 0);

  /* ── Callbacks ── */
  private cb: HomeCarSceneCallbacks;

  /* ═════════════════════════════════════════════ */
  /*  CONSTRUCTOR                                  */
  /* ═════════════════════════════════════════════ */

  constructor(container: HTMLElement, cb: HomeCarSceneCallbacks = {}) {
    this.container = container;
    this.cb = cb;

    /* Scene */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080808);
    this.scene.fog = new THREE.FogExp2(0x080808, 0.012);
    this.scene.add(this.carGroup);

    /* Camera */
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 600);
    this.camera.position.copy(this.CAM_INITIAL);
    this.camera.lookAt(this.CAM_LOOK);

    /* Renderer */
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    /* Setup scene elements */
    this.buildLighting();
    this.buildGround();
    this.buildGrid();
    this.buildParticles();

    /* Events */
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    /* Load model */
    this.loadModel();

    /* Render loop */
    this.tick();
  }

  /* ═════════════════════════════════════════════ */
  /*  SCENE SETUP                                  */
  /* ═════════════════════════════════════════════ */

  private buildLighting() {
    /* Ambient — very low at start, raised during intro */
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.03);
    this.scene.add(this.ambientLight);

    /* Key light */
    this.mainLight = new THREE.DirectionalLight(0xfff5ee, 0);
    this.mainLight.position.set(6, 14, 6);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.set(2048, 2048);
    this.mainLight.shadow.camera.near = 0.5;
    this.mainLight.shadow.camera.far = 50;
    this.mainLight.shadow.camera.left = -10;
    this.mainLight.shadow.camera.right = 10;
    this.mainLight.shadow.camera.top = 10;
    this.mainLight.shadow.camera.bottom = -10;
    this.mainLight.shadow.bias = -0.0004;
    this.scene.add(this.mainLight);

    /* Fill */
    this.fillLight = new THREE.DirectionalLight(0xdde4f0, 0);
    this.fillLight.position.set(-7, 5, -5);
    this.scene.add(this.fillLight);

    /* TGR Red rim */
    this.redRimLight = new THREE.PointLight(0xe10600, 0, 28);
    this.redRimLight.position.set(-5.5, 2.2, -2.5);
    this.scene.add(this.redRimLight);

    /* Blue tech accent */
    this.blueAccentLight = new THREE.PointLight(0x1a6fff, 0, 20);
    this.blueAccentLight.position.set(5.5, 1.2, 3.5);
    this.scene.add(this.blueAccentLight);

    /* Red sweep spotlight */
    this.redSweepSpot = new THREE.SpotLight(0xe10600, 0, 35, Math.PI / 7, 0.6);
    this.redSweepSpot.position.set(0, 8, -9);
    this.redSweepSpot.target.position.set(0, 0, 0);
    this.scene.add(this.redSweepSpot);
    this.scene.add(this.redSweepSpot.target);
  }

  private buildGround() {
    const geo = new THREE.PlaneGeometry(120, 120);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.75,
      metalness: 0.25,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.02;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildGrid() {
    /* Fine engineering grid */
    const fine = new THREE.GridHelper(50, 60, 0x181818, 0x141414);
    fine.position.y = 0;
    (fine.material as THREE.Material).opacity = 0.35;
    (fine.material as THREE.Material).transparent = true;
    this.scene.add(fine);

    /* Major red-tinted grid lines */
    const major = new THREE.GridHelper(50, 5, 0x2a0000, 0x1a0000);
    major.position.y = 0.002;
    (major.material as THREE.Material).opacity = 0.4;
    (major.material as THREE.Material).transparent = true;
    this.scene.add(major);
  }

  private buildParticles() {
    const COUNT = 600;
    this.particlePositions = new Float32Array(COUNT * 3);
    this.particleSpeeds = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      this.particlePositions[i * 3]     = (Math.random() - 0.5) * 70;
      this.particlePositions[i * 3 + 1] = Math.random() * 18;
      this.particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
      this.particleSpeeds[i] = 0.002 + Math.random() * 0.006;

      if (Math.random() < 0.15) {
        colors[i * 3] = 0.88; colors[i * 3 + 1] = 0.02; colors[i * 3 + 2] = 0.0;
      } else {
        const b = 0.25 + Math.random() * 0.2;
        colors[i * 3] = b; colors[i * 3 + 1] = b; colors[i * 3 + 2] = b;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  /* ═════════════════════════════════════════════ */
  /*  MODEL LOADING                                */
  /* ═════════════════════════════════════════════ */

  private loadModel() {
    const loader = new GLTFLoader();

    loader.load(
      '/models/f2_car.glb',
      (gltf) => {
        if (this.isDestroyed) return;

        const model = gltf.scene;

        /* Auto-center & scale to a sensible size */
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 5.5 / maxDim;

        model.scale.setScalar(scale);
        // Re-compute center after scaling
        const scaledBox = new THREE.Box3().setFromObject(model);
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        model.position.sub(scaledCenter);
        model.position.y = -scaledBox.min.y * 1; // sit on ground
        // Re-adjust: set y so the bottom of the car is at y=0
        const finalBox = new THREE.Box3().setFromObject(model);
        model.position.y -= finalBox.min.y;

        /* Enhance materials for cinematic look */
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                const mat = m as THREE.MeshStandardMaterial;
                mat.envMapIntensity = 1.8;
                mat.metalness = Math.max(mat.metalness, 0.35);
                mat.roughness = Math.min(mat.roughness, 0.65);
                /* Start transparent for intro fade-in */
                mat.transparent = true;
                mat.opacity = 0;
              }
            });
          }
        });

        this.carGroup.add(model);
        this.modelLoaded = true;
        this.cb.onLoaded?.();
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          this.cb.onProgress?.((xhr.loaded / xhr.total) * 100);
        }
      },
      (err) => {
        console.error('HomeCarScene: model load failed', err);
        this.cb.onError?.(`Model load failed: ${err}`);
      },
    );
  }

  /* ═════════════════════════════════════════════ */
  /*  PUBLIC API                                   */
  /* ═════════════════════════════════════════════ */

  startIntro() {
    this.introRunning = true;
    this.introStart = this.clock.getElapsedTime();
  }

  setScrollProgress(p: number) {
    this.scrollProg = Math.max(0, Math.min(1, p));
  }

  setMouse(nx: number, ny: number) {
    this.mouseNX = nx;
    this.mouseNY = ny;
  }

  /* ═════════════════════════════════════════════ */
  /*  RENDER LOOP                                  */
  /* ═════════════════════════════════════════════ */

  private tick = () => {
    if (this.isDestroyed) return;
    this.animId = requestAnimationFrame(this.tick);

    const t = this.clock.getElapsedTime();

    /* Smooth mouse */
    this.smoothMX += (this.mouseNX - this.smoothMX) * 0.025;
    this.smoothMY += (this.mouseNY - this.smoothMY) * 0.025;

    if (this.introRunning) this.stepIntro(t);
    this.stepCamera(t);
    this.stepParticles(t);
    this.stepIdleRotation(t);
    this.stepRedSweep(t);

    this.renderer.render(this.scene, this.camera);
  };

  /* ── Intro sequence (≈5 s) ── */
  private stepIntro(t: number) {
    const e = t - this.introStart;

    /* Phase A (0-1 s): ambient gently rises */
    if (e < 1) {
      this.ambientLight.intensity = smoothstep(e) * 0.08;
    }

    /* Phase B (0.8-3 s): car fades in */
    if (e >= 0.8 && e < 3.2) {
      const o = smoothstep((e - 0.8) / 2.4);
      this.carGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const mats = Array.isArray((c as THREE.Mesh).material)
            ? (c as THREE.Mesh).material as THREE.Material[]
            : [(c as THREE.Mesh).material];
          mats.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              (m as THREE.MeshStandardMaterial).opacity = o;
            }
          });
        }
      });
    }

    /* Phase C (0.5-3 s): key + fill lights */
    if (e >= 0.5 && e < 3) {
      const p = smoothstep((e - 0.5) / 2.5);
      this.mainLight.intensity = p * 2.8;
      this.fillLight.intensity = p * 0.9;
    }

    /* Phase D (1-3.5 s): camera dolly to hero position */
    if (e >= 0.5) {
      const p = easeOutQuart(Math.min((e - 0.5) / 3.5, 1));
      this.camera.position.lerpVectors(this.CAM_INITIAL, this.CAM_HERO, p);
    }

    /* Phase E (2.5-4 s): red rim light */
    if (e >= 2.5 && e < 4) {
      this.redRimLight.intensity = smoothstep((e - 2.5) / 1.5) * 3.5;
    }

    /* Phase F (3-4.2 s): red sweep */
    if (e >= 3 && e < 4.2) {
      this.redSweepSpot.intensity = smoothstep((e - 3) / 1.2) * 2.5;
    }

    /* Phase G (3.2-4.2 s): blue accent */
    if (e >= 3.2 && e < 4.2) {
      this.blueAccentLight.intensity = smoothstep((e - 3.2) / 1.0) * 1.8;
    }

    /* Phase H (1.5-3 s): particles */
    if (e >= 1.5 && e < 3) {
      (this.particles.material as THREE.PointsMaterial).opacity = smoothstep((e - 1.5) / 1.5) * 0.55;
    }

    /* Done */
    if (e >= 5) {
      this.introRunning = false;
      /* Ensure final state */
      this.ambientLight.intensity = 0.12;
      this.mainLight.intensity = 2.8;
      this.fillLight.intensity = 0.9;
      this.redRimLight.intensity = 3.5;
      this.blueAccentLight.intensity = 1.8;
      this.redSweepSpot.intensity = 2.5;
      (this.particles.material as THREE.PointsMaterial).opacity = 0.55;

      this.carGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const mats = Array.isArray((c as THREE.Mesh).material)
            ? (c as THREE.Mesh).material as THREE.Material[]
            : [(c as THREE.Mesh).material];
          mats.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              (m as THREE.MeshStandardMaterial).opacity = 1;
              (m as THREE.MeshStandardMaterial).transparent = false;
            }
          });
        }
      });
    }
  }

  /* ── Camera position ── */
  private stepCamera(t: number) {
    if (this.introRunning) {
      this.camera.lookAt(this.CAM_LOOK);
      return;
    }

    /* Scroll orbit */
    const scrollAng = this.scrollProg * Math.PI * 0.35;
    const scrollR   = 8 + this.scrollProg * 3;
    const scrollY   = 2.8 + this.scrollProg * 2.5;

    /* Mouse parallax */
    const mx = this.smoothMX * 0.8;
    const my = this.smoothMY * 0.4;

    /* Idle drift */
    const ix = Math.sin(t * 0.08) * 0.25;
    const iy = Math.cos(t * 0.12) * 0.12;

    const baseAng = Math.atan2(this.CAM_HERO.z, this.CAM_HERO.x);
    const ang = baseAng + scrollAng;

    const tx = Math.cos(ang) * scrollR + mx + ix;
    const ty = scrollY + my + iy;
    const tz = Math.sin(ang) * scrollR;

    this.camera.position.lerp(new THREE.Vector3(tx, ty, tz), 0.045);
    this.camera.lookAt(this.CAM_LOOK);

    /* Fade car with deep scroll */
    if (this.scrollProg > 0.55 && this.modelLoaded) {
      const fade = 1 - (this.scrollProg - 0.55) / 0.45;
      this.carGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const mats = Array.isArray((c as THREE.Mesh).material)
            ? (c as THREE.Mesh).material as THREE.Material[]
            : [(c as THREE.Mesh).material];
          mats.forEach((m) => {
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
              (m as THREE.MeshStandardMaterial).transparent = true;
              (m as THREE.MeshStandardMaterial).opacity = Math.max(0.1, fade);
            }
          });
        }
      });
    }
  }

  /* ── Particles drift ── */
  private stepParticles(t: number) {
    const pos = this.particles.geometry.attributes.position;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3 + 1] += this.particleSpeeds[i];
      if (arr[i * 3 + 1] > 18) arr[i * 3 + 1] = 0;
    }
    pos.needsUpdate = true;

    /* Subtle rotation of entire particle field */
    this.particles.rotation.y = t * 0.003;
  }

  /* ── Car idle rotation ── */
  private stepIdleRotation(t: number) {
    if (!this.modelLoaded || this.introRunning) return;
    this.carGroup.rotation.y = Math.sin(t * 0.06) * 0.04;
  }

  /* ── Red light sweep cycle ── */
  private stepRedSweep(t: number) {
    if (this.introRunning) return;
    /* Move sweep light position in a slow arc */
    const ang = t * 0.15;
    this.redSweepSpot.position.x = Math.sin(ang) * 8;
    this.redSweepSpot.position.z = -6 + Math.cos(ang) * 3;
  }

  /* ═════════════════════════════════════════════ */
  /*  RESIZE                                       */
  /* ═════════════════════════════════════════════ */

  private onResize() {
    if (this.isDestroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ═════════════════════════════════════════════ */
  /*  CLEANUP                                      */
  /* ═════════════════════════════════════════════ */

  dispose() {
    this.isDestroyed = true;
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);

    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
