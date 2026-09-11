/**
 * TGR × F1 — System Health Command Center 3D Scene Controller
 *
 * Provides a specialized Three.js digital twin viewport for the System Health
 * Command Center page:
 * - Loads the real converted F1 car model (f1_car.glb) with 1:1 geometry preserved.
 * - Top-down / slight isometric camera angle (Front pointing UP, Rear pointing DOWN).
 * - Intro scanning pass line animation & sequential tyre telemetry activation.
 * - Interactive 3D raycasting tyre click selection & smooth camera focus interpolation.
 * - Multi-mode telemetry visualizations: NORMAL, THERMAL, WEAR, LOAD, GRIP, PREDICTION.
 * - Real-time 2D screen coordinate projection for dynamic SVG telemetry leader lines.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TyreCorner, TyreVisMode } from '../types/telemetry';

export interface HealthCarSceneCallbacks {
  onTyreSelect?: (corner: TyreCorner) => void;
  onTyreHover?: (corner: TyreCorner | null) => void;
  onScreenPositionsUpdate?: (positions: Record<TyreCorner, { x: number; y: number; visible: boolean }>) => void;
  onLoaded?: () => void;
  onError?: (msg: string) => void;
}

export interface TyreThermalValues {
  inner: number;
  center: number;
  outer: number;
  surface: number;
}

export class HealthCarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private clock = new THREE.Clock();
  private animId: number | null = null;
  private isDestroyed = false;

  // Model & Wheel references
  private carGroup = new THREE.Group();
  private bodyMesh: THREE.Mesh | null = null;
  private wheelMeshes: Partial<Record<TyreCorner, THREE.Mesh>> = {};
  private wheelOriginalMaterials: Partial<Record<TyreCorner, THREE.Material | THREE.Material[]>> = {};

  // Raycasting & Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-999, -999);
  private hoveredCorner: TyreCorner | null = null;
  private selectedCorner: TyreCorner = 'FR';

  // Camera positions & Lerping
  // Top-down / slight isometric: car oriented Front = points up on screen, Rear = points down
  // Height 10.8 provides clean negative space around the full 5.49m F1 vehicle
  private readonly DEFAULT_CAM_POS = new THREE.Vector3(0, 10.8, 0.35);
  private readonly DEFAULT_LOOK_AT = new THREE.Vector3(0, 0, 0);
  private targetCamPos = new THREE.Vector3().copy(this.DEFAULT_CAM_POS);
  private targetLookAt = new THREE.Vector3().copy(this.DEFAULT_LOOK_AT);
  private currentLookAt = new THREE.Vector3().copy(this.DEFAULT_LOOK_AT);

  // Subtle wheel target offsets for camera focus (keeps the full car visible while directing focus)
  private wheelFocusOffsets: Record<TyreCorner, { cam: THREE.Vector3; look: THREE.Vector3 }> = {
    FL: { cam: new THREE.Vector3(-0.9, 9.4, -0.8), look: new THREE.Vector3(-0.5, 0.2, -0.8) },
    FR: { cam: new THREE.Vector3(0.9, 9.4, -0.8), look: new THREE.Vector3(0.5, 0.2, -0.8) },
    RL: { cam: new THREE.Vector3(-0.9, 9.4, 1.2), look: new THREE.Vector3(-0.5, 0.2, 1.0) },
    RR: { cam: new THREE.Vector3(0.9, 9.4, 1.2), look: new THREE.Vector3(0.5, 0.2, 1.0) },
  };

  // Lighting
  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private mainDirLight!: THREE.DirectionalLight;
  private fillDirLight!: THREE.DirectionalLight;
  private topDirLight!: THREE.DirectionalLight;
  private redRimLight!: THREE.PointLight;
  private blueAccentLight!: THREE.PointLight;

  // Scanning laser beam & Intro animation
  private scanLaserPlane!: THREE.Mesh;
  private scanLaserMaterial!: THREE.ShaderMaterial;
  private introProgress = 0; // 0 -> 1
  private introActive = true;

  // Visualization Mode & Data
  private currentVisMode: TyreVisMode = 'NORMAL';
  private thermalData: Record<TyreCorner, TyreThermalValues> = {
    FL: { inner: 105, center: 102, outer: 98, surface: 102 },
    FR: { inner: 112, center: 108, outer: 101, surface: 108 },
    RL: { inner: 104, center: 101, outer: 96, surface: 101 },
    RR: { inner: 106, center: 103, outer: 99, surface: 103 },
  };
  private wearData: Record<TyreCorner, number> = { FL: 18, FR: 21, RL: 15, RR: 17 };
  private loadData: Record<TyreCorner, number> = { FL: 3.8, FR: 4.2, RL: 3.2, RR: 3.5 };
  private gripData: Record<TyreCorner, number> = { FL: 91, FR: 87, RL: 94, RR: 92 };

  // Callbacks
  private cb: HealthCarSceneCallbacks;

  constructor(container: HTMLElement, cb: HealthCarSceneCallbacks = {}) {
    this.container = container;
    this.cb = cb;

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc); // Clean motorsport light slate background

    // 2. Camera setup: Top-down slight isometric
    const aspect = Math.max(0.1, container.clientWidth / container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 100);
    this.camera.position.copy(this.DEFAULT_CAM_POS);
    this.camera.lookAt(this.DEFAULT_LOOK_AT);

    // 3. High-precision WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // 4. Setup Lighting, Grid, and Elements
    this.buildLighting();
    this.buildGroundAndGrid();
    this.buildScanLaser();
    this.carGroup.rotation.y = Math.PI;
    this.scene.add(this.carGroup);

    // 5. Event Listeners
    this.onResize = this.onResize.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onClick = this.onClick.bind(this);

    window.addEventListener('resize', this.onResize);
    this.container.addEventListener('mousemove', this.onPointerMove);
    this.container.addEventListener('click', this.onClick);

    // 6. Load Model & Start Animation Loop
    this.loadCarModel();
    this.tick();
  }

  /* ────────────────────────────────────────────── */
  /*  Lighting Setup                                */
  /* ────────────────────────────────────────────── */
  private buildLighting() {
    // High-key clean ambient
    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    this.scene.add(this.ambientLight);

    // Balanced Hemisphere light for motorsport engineering studio
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.85);
    this.scene.add(this.hemiLight);

    // Key studio overhead light
    this.mainDirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.mainDirLight.position.set(5, 14, 4);
    this.mainDirLight.castShadow = true;
    this.mainDirLight.shadow.mapSize.set(2048, 2048);
    this.mainDirLight.shadow.camera.near = 1;
    this.mainDirLight.shadow.camera.far = 25;
    this.mainDirLight.shadow.camera.left = -5;
    this.mainDirLight.shadow.camera.right = 5;
    this.mainDirLight.shadow.camera.top = 5;
    this.mainDirLight.shadow.camera.bottom = -5;
    this.mainDirLight.shadow.bias = -0.0003;
    this.scene.add(this.mainDirLight);

    // Top direct light to highlight aero curves and sidepods
    this.topDirLight = new THREE.DirectionalLight(0xfff5ee, 0.9);
    this.topDirLight.position.set(0, 16, 0);
    this.scene.add(this.topDirLight);

    // Soft fill light from front-left
    this.fillDirLight = new THREE.DirectionalLight(0xe2e8f0, 0.8);
    this.fillDirLight.position.set(-6, 8, -5);
    this.scene.add(this.fillDirLight);

    // Subtle TGR Red rim light
    this.redRimLight = new THREE.PointLight(0xe10600, 2.4, 14);
    this.redRimLight.position.set(-3.5, 2.0, -2.5);
    this.scene.add(this.redRimLight);

    // Subtle Technical Blue rim light
    this.blueAccentLight = new THREE.PointLight(0x0284c7, 2.0, 14);
    this.blueAccentLight.position.set(3.5, 2.0, 2.5);
    this.scene.add(this.blueAccentLight);
  }

  /* ────────────────────────────────────────────── */
  /*  Ground & Engineering Grid                     */
  /* ────────────────────────────────────────────── */
  private buildGroundAndGrid() {
    // Shadow receiver plane
    const planeGeo = new THREE.PlaneGeometry(30, 30);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.14 });
    const ground = new THREE.Mesh(planeGeo, planeMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Precision engineering grid
    const gridHelper = new THREE.GridHelper(20, 40, 0xd1d5db, 0xe2e8f0);
    gridHelper.position.y = 0;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.55;
    this.scene.add(gridHelper);

    // Subtle red target calibration ring around center
    const ringGeo = new THREE.RingGeometry(3.6, 3.63, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe10600,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.scene.add(ring);
  }

  /* ────────────────────────────────────────────── */
  /*  Intro Scanning Laser Sweep                    */
  /* ────────────────────────────────────────────── */
  private buildScanLaser() {
    const laserGeo = new THREE.PlaneGeometry(3.6, 0.08);
    this.scanLaserMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xe10600) },
        uProgress: { value: 0.0 },
        uOpacity: { value: 0.85 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float edgeFade = smoothstep(0.0, 0.45, vUv.x) * smoothstep(1.0, 0.55, vUv.x);
          float lineGlow = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          gl_FragColor = vec4(uColor, edgeFade * lineGlow * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.scanLaserPlane = new THREE.Mesh(laserGeo, this.scanLaserMaterial);
    this.scanLaserPlane.rotation.x = -Math.PI / 2;
    this.scanLaserPlane.position.set(0, 0.35, -3.2);
    this.scene.add(this.scanLaserPlane);
  }

  /* ────────────────────────────────────────────── */
  /*  Model Loading (f1_car.glb)                    */
  /* ────────────────────────────────────────────── */
  private loadCarModel() {
    const loader = new GLTFLoader();
    const modelPath = '/models/f1_car.glb';

    loader.load(
      modelPath,
      (gltf) => {
        if (this.isDestroyed) return;

        const root = gltf.scene;

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const name = mesh.name;

            if (name.includes('Wheel_FL')) {
              this.wheelMeshes.FL = mesh;
              this.wheelOriginalMaterials.FL = mesh.material;
            } else if (name.includes('Wheel_FR')) {
              this.wheelMeshes.FR = mesh;
              this.wheelOriginalMaterials.FR = mesh.material;
            } else if (name.includes('Wheel_RL')) {
              this.wheelMeshes.RL = mesh;
              this.wheelOriginalMaterials.RL = mesh.material;
            } else if (name.includes('Wheel_RR')) {
              this.wheelMeshes.RR = mesh;
              this.wheelOriginalMaterials.RR = mesh.material;
            } else if (name.includes('Car_Body')) {
              this.bodyMesh = mesh;
            }

            // Tune materials for premium engineering look
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach((m) => {
              if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                const std = m as THREE.MeshStandardMaterial;
                if (mesh === this.bodyMesh) {
                  std.color.setHex(0x1a1c20); // Sleek titanium carbon chassis
                  std.metalness = 0.55;
                  std.roughness = 0.4;
                } else {
                  // Wheels / tyres
                  std.color.setHex(0x111215); // Competition tyre rubber
                  std.metalness = 0.15;
                  std.roughness = 0.75;
                }
              }
            });
          }
        });

        this.carGroup.add(root);
        this.updateVisualizationMode();
        this.cb.onLoaded?.();
      },
      undefined,
      (err) => {
        console.error('HealthCarScene: Failed to load f1_car.glb', err);
        this.cb.onError?.(`Failed to load 3D model: ${err}`);
      }
    );
  }

  /* ────────────────────────────────────────────── */
  /*  Tyre Selection & Camera Focus                 */
  /* ────────────────────────────────────────────── */
  public selectTyre(corner: TyreCorner, focusCamera: boolean = true) {
    this.selectedCorner = corner;

    if (focusCamera) {
      const offset = this.wheelFocusOffsets[corner];
      if (offset) {
        this.targetCamPos.copy(offset.cam);
        this.targetLookAt.copy(offset.look);
      }
    }

    this.updateVisualizationMode();
    this.cb.onTyreSelect?.(corner);
  }

  public resetCamera() {
    this.targetCamPos.copy(this.DEFAULT_CAM_POS);
    this.targetLookAt.copy(this.DEFAULT_LOOK_AT);
  }

  /* ────────────────────────────────────────────── */
  /*  Visualization Modes Management                */
  /* ────────────────────────────────────────────── */
  public setVisualizationMode(mode: TyreVisMode) {
    this.currentVisMode = mode;
    this.updateVisualizationMode();
  }

  public setTelemetryData(data: {
    thermal?: Record<TyreCorner, TyreThermalValues>;
    wear?: Record<TyreCorner, number>;
    load?: Record<TyreCorner, number>;
    grip?: Record<TyreCorner, number>;
  }) {
    if (data.thermal) this.thermalData = data.thermal;
    if (data.wear) this.wearData = data.wear;
    if (data.load) this.loadData = data.load;
    if (data.grip) this.gripData = data.grip;

    this.updateVisualizationMode();
  }

  private updateVisualizationMode() {
    const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];

    corners.forEach((corner) => {
      const mesh = this.wheelMeshes[corner];
      if (!mesh) return;

      const isSelected = this.selectedCorner === corner;
      const isHovered = this.hoveredCorner === corner;

      let color = new THREE.Color(0x111215);
      let emissive = new THREE.Color(0x000000);
      let emissiveIntensity = 0;
      let roughness = 0.75;
      let metalness = 0.15;

      switch (this.currentVisMode) {
        case 'THERMAL': {
          const t = this.thermalData[corner]?.surface ?? 100;
          color = this.getThermalColor(t);
          emissive = color.clone();
          emissiveIntensity = 0.45;
          break;
        }
        case 'WEAR': {
          const w = this.wearData[corner] ?? 20;
          if (w < 25) color = new THREE.Color(0x10b981); // Emerald fresh
          else if (w < 45) color = new THREE.Color(0xf59e0b); // Amber graining
          else color = new THREE.Color(0xef4444); // Red critical degradation
          emissive = color.clone();
          emissiveIntensity = 0.35;
          roughness = 0.85;
          break;
        }
        case 'LOAD': {
          const load = this.loadData[corner] ?? 4.0;
          const loadRatio = Math.min(1.0, Math.max(0, (load - 2.0) / 3.5));
          color = new THREE.Color().lerpColors(new THREE.Color(0x0284c7), new THREE.Color(0xe10600), loadRatio);
          emissive = color.clone();
          emissiveIntensity = 0.5;
          break;
        }
        case 'GRIP': {
          const g = this.gripData[corner] ?? 90;
          if (g > 85) color = new THREE.Color(0x10b981);
          else if (g > 70) color = new THREE.Color(0xf59e0b);
          else color = new THREE.Color(0xef4444);
          emissive = color.clone();
          emissiveIntensity = 0.3;
          break;
        }
        case 'PREDICTION': {
          color = new THREE.Color(0xe10600);
          emissive = new THREE.Color(0xe10600);
          emissiveIntensity = 0.4;
          break;
        }
        case 'NORMAL':
        default: {
          color = new THREE.Color(0x131518);
          emissiveIntensity = 0.0;
          break;
        }
      }

      // Add prominent red highlight border/glow if selected
      if (isSelected) {
        emissive = new THREE.Color(0xe10600);
        emissiveIntensity = Math.max(emissiveIntensity, 0.65);
      } else if (isHovered) {
        emissive = new THREE.Color(0x38bdf8);
        emissiveIntensity = Math.max(emissiveIntensity, 0.45);
      }

      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat && mat.isMeshStandardMaterial) {
        mat.color.copy(color);
        mat.emissive.copy(emissive);
        mat.emissiveIntensity = emissiveIntensity;
        mat.roughness = roughness;
        mat.metalness = metalness;
      }
    });
  }

  private getThermalColor(tempC: number): THREE.Color {
    // Smooth 6-stage FLIR gradient
    if (tempC < 75) return new THREE.Color(0x0284c7); // Deep blue / cool
    if (tempC < 90) return new THREE.Color(0x06b6d4); // Cyan / warmup
    if (tempC < 105) return new THREE.Color(0x10b981); // Emerald / optimal
    if (tempC < 115) return new THREE.Color(0xf59e0b); // Amber / warm
    if (tempC < 125) return new THREE.Color(0xf97316); // Orange / high
    return new THREE.Color(0xef4444); // Crimson / blistering
  }

  /* ────────────────────────────────────────────── */
  /*  Screen Position Projection for Leader Lines   */
  /* ────────────────────────────────────────────── */
  private updateScreenPositions() {
    const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
    const positions: Record<TyreCorner, { x: number; y: number; visible: boolean }> = {
      FL: { x: 0, y: 0, visible: false },
      FR: { x: 0, y: 0, visible: false },
      RL: { x: 0, y: 0, visible: false },
      RR: { x: 0, y: 0, visible: false },
    };

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    corners.forEach((corner) => {
      const mesh = this.wheelMeshes[corner];
      if (mesh) {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        worldPos.project(this.camera);

        const x = ((worldPos.x + 1) * width) / 2;
        const y = ((-worldPos.y + 1) * height) / 2;
        const visible = worldPos.z < 1.0;

        positions[corner] = { x, y, visible };
      }
    });

    this.cb.onScreenPositionsUpdate?.(positions);
  }

  /* ────────────────────────────────────────────── */
  /*  Pointer Events & Raycasting                   */
  /* ────────────────────────────────────────────── */
  private onPointerMove(e: MouseEvent) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Subtle parallax effect on car group
    if (!this.introActive) {
      const targetRotY = Math.PI + this.mouse.x * 0.05;
      const targetRotX = -this.mouse.y * 0.03;
      this.carGroup.rotation.y += (targetRotY - this.carGroup.rotation.y) * 0.06;
      this.carGroup.rotation.x += (targetRotX - this.carGroup.rotation.x) * 0.06;
    }

    // Check hover on wheels
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const wheels = Object.values(this.wheelMeshes).filter(Boolean) as THREE.Mesh[];
    const intersects = this.raycaster.intersectObjects(wheels, false);

    let newHovered: TyreCorner | null = null;
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      for (const [corner, mesh] of Object.entries(this.wheelMeshes)) {
        if (mesh === hitMesh) {
          newHovered = corner as TyreCorner;
          break;
        }
      }
    }

    if (newHovered !== this.hoveredCorner) {
      this.hoveredCorner = newHovered;
      this.container.style.cursor = newHovered ? 'pointer' : 'default';
      this.updateVisualizationMode();
      this.cb.onTyreHover?.(newHovered);
    }
  }

  private onClick() {
    if (this.hoveredCorner) {
      this.selectTyre(this.hoveredCorner);
    }
  }

  private onResize() {
    if (!this.container || this.isDestroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = Math.max(0.1, w / h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /* ────────────────────────────────────────────── */
  /*  Render Loop & Easing                          */
  /* ────────────────────────────────────────────── */
  private tick() {
    if (this.isDestroyed) return;
    this.animId = requestAnimationFrame(() => this.tick());

    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    // Intro Laser Scanning Animation
    if (this.introActive) {
      this.introProgress += delta * 0.65;
      const zPos = -3.2 + this.introProgress * 6.4; // Sweep from front to rear
      this.scanLaserPlane.position.z = zPos;

      if (this.scanLaserMaterial.uniforms) {
        this.scanLaserMaterial.uniforms.uProgress.value = this.introProgress;
      }

      if (this.introProgress >= 1.0) {
        this.introActive = false;
        this.scanLaserPlane.visible = false;
      }
    }

    // Smooth Camera Position and LookAt Lerp
    this.camera.position.lerp(this.targetCamPos, 0.055);
    this.currentLookAt.lerp(this.targetLookAt, 0.055);
    this.camera.lookAt(this.currentLookAt);

    // Subtle Prediction Pulse if in PREDICTION mode
    if (this.currentVisMode === 'PREDICTION') {
      const pulse = 0.3 + 0.3 * Math.sin(elapsedTime * 4.0);
      const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
      corners.forEach((c) => {
        const mesh = this.wheelMeshes[c];
        if (mesh && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
        }
      });
    }

    // Update screen positions of wheels for UI data lines
    this.updateScreenPositions();

    this.renderer.render(this.scene, this.camera);
  }

  /* ────────────────────────────────────────────── */
  /*  Cleanup                                       */
  /* ────────────────────────────────────────────── */
  public destroy() {
    this.isDestroyed = true;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
    }

    window.removeEventListener('resize', this.onResize);
    this.container.removeEventListener('mousemove', this.onPointerMove);
    this.container.removeEventListener('click', this.onClick);

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }

    this.renderer.dispose();
  }
}
