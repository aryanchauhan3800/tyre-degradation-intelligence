/**
 * TYRETRACE — Hero 3D F1 Tyre Digital Twin Scene
 *
 * Implements a studio-grade interactive 3D visualization centered entirely on:
 * ONE single F1 Front Wheel model ('public/assets/models/F1 Front wheel.obj.glb')
 *
 * Key Design & Physics Rules:
 * - Tyre is 100% REALISTIC DEEP BLACK RACING RUBBER (matte charcoal, realistic roughness).
 * - Running tread carries the LIVE dynamic thermal heatmap (8-stop F1 palette).
 * - Sidewall NEVER turns blue; preserves authentic Pirelli & P-Zero yellow branding.
 * - Rolling is ACTIVE BY DEFAULT: smooth, concentric, zero-wobble rotation around geometric axle (Z-axis).
 * - Real speed physics: omega = v / 0.36 rad/s.
 * - User can freeze/pause rolling anytime via the controls.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  CameraPreset,
  DataMode,
  FourWheelTyres,
  PhysicsTwinOutput,
  TDIStateResponse,
  TelemetryFrame,
  TyreCorner,
  TyreVisMode,
} from '../types/telemetry';
import { calculateTyreCornerState } from '../utils/tyreCalculations';
import { TyreThermalSimulation } from '../utils/TyreThermalSimulation';
import {
  thermalVertexShaderChunk,
  thermalVertexShaderAssign,
  thermalFragmentHeader,
  thermalColorFragmentReplace,
  thermalEmissiveFragmentReplace,
} from '../components/TyreScene/ThermalShader';

export interface ThermalCalloutPoint {
  id: 'hotSpot' | 'innerShoulder' | 'surfaceTemp' | 'treadCenter' | 'contactPatch' | 'outerShoulder';
  name: string;
  screenX: number;
  screenY: number;
  pctX: number;
  pctY: number;
  isOccluded: boolean;
  opacity: number;
}

export interface HeroTyreSceneCallbacks {
  onHover?: (isHovered: boolean) => void;
  onClick?: () => void;
  onCalloutsUpdate?: (callouts: Record<string, ThermalCalloutPoint>) => void;
}

export class HeroTyreScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private animId: number | null = null;
  private isDestroyed = false;

  // 3D Nodes
  public rootGroup: THREE.Group;
  public orientationGroup: THREE.Group;
  public spinGroup: THREE.Group;
  public thermalZoneGroup: THREE.Group;
  public wheelModel: THREE.Group | null = null;

  // 6 Persistent 3D Anchors on the physical rotating tyre tread
  public readonly hotSpotAnchor = new THREE.Object3D();
  public readonly innerShoulderAnchor = new THREE.Object3D();
  public readonly surfaceTempAnchor = new THREE.Object3D();
  public readonly treadCenterAnchor = new THREE.Object3D();
  public readonly contactPatchAnchor = new THREE.Object3D();
  public readonly outerShoulderAnchor = new THREE.Object3D();

  // Material Separation
  public treadMaterials: THREE.MeshStandardMaterial[] = [];
  public sidewallMaterials: THREE.MeshStandardMaterial[] = [];
  public letteringMaterials: THREE.MeshStandardMaterial[] = [];
  public rimMaterials: THREE.MeshStandardMaterial[] = [];
  public hubNutMaterials: THREE.MeshStandardMaterial[] = [];

  // Overlays
  public contactPatchGlow: THREE.Mesh | null = null;
  public predictiveHoloRing: THREE.LineLoop | null = null;
  public trackMesh: THREE.Mesh | null = null;
  public trackTexture: THREE.CanvasTexture | null = null;
  public kerbTexture: THREE.CanvasTexture | null = null;
  public turfTexture: THREE.CanvasTexture | null = null;
  public yellowLineMesh: THREE.Mesh | null = null;
  public motionBlurMaterial: THREE.MeshBasicMaterial | null = null;
  public allWheelMaterials: THREE.MeshStandardMaterial[] = [];

  // Physics Thermal Engine
  public thermalSim = new TyreThermalSimulation('FR');
  private lastTelemetryData: {
    speedKph: number;
    dataMode: DataMode;
    fourWheelStates?: FourWheelTyres | null;
    telemetryFrame?: TelemetryFrame | null;
    physicsOutput?: PhysicsTwinOutput | null;
    tdiResponse?: TDIStateResponse | null;
  } = { speedKph: 0, dataMode: 'REPLAY' };

  // Thermal Shader Uniforms
  public thermalUniforms = {
    uThermalActive: { value: 0.0 },
    uInnerShoulderTemp: { value: 25.0 },
    uInnerTreadTemp: { value: 25.0 },
    uCenterTreadTemp: { value: 25.0 },
    uOuterTreadTemp: { value: 25.0 },
    uOuterShoulderTemp: { value: 25.0 },
    uSurfaceTemp: { value: 25.0 },
    uContactPatchHeat: { value: 0.0 },
    uWheelAngle: { value: 0.0 },
  };

  // Uniform Lerping Targets (Smooth continuous updates)
  private currentInnerShoulderTemp = 25.0;
  private currentInnerTreadTemp = 25.0;
  private currentCenterTreadTemp = 25.0;
  private currentOuterTreadTemp = 25.0;
  private currentOuterShoulderTemp = 25.0;
  private currentSurfaceTemp = 25.0;
  private currentContactPatchHeat = 0.0;

  // Active state - THERMAL IS ACTIVE BY DEFAULT, FROZEN BY DEFAULT MATCHING REFERENCE
  private activeCorner: TyreCorner = 'FR';
  private visMode: TyreVisMode = 'THERMAL';
  public isRolling = false;
  private currentSpeedKph = 0;
  public speedMultiplier = 0.0;
  private wheelRotationAngle = 0;
  private clock = new THREE.Clock();

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private isHovered = false;
  private callbacks: HeroTyreSceneCallbacks;

  // Camera presets: Exact 3/4 beauty hero framing matching reference screenshot
  // Turned ~62 degrees from axle: Tread occupies ~48% width on left, Rim occupies ~52% width on right
  private readonly DEFAULT_CAM_POS = new THREE.Vector3(-2.05, 0.44, 1.10);
  private readonly DEFAULT_CAM_TARGET = new THREE.Vector3(0.08, 0.0, 0.0);

  // Smooth camera interpolation
  private isCameraTransitioning = false;
  private cameraAnimProgress = 1.0;
  private startCameraPos = new THREE.Vector3();
  private targetCameraPos = new THREE.Vector3();
  private startCameraTarget = new THREE.Vector3();
  private targetCameraTarget = new THREE.Vector3();

  // Speed Mode: 'FREEZE' by default matching reference [ ❄ FROZEN ]
  public speedMode: 'REAL' | 'SLOWMO' | 'FREEZE' = 'FREEZE';

  constructor(container: HTMLElement, callbacks: HeroTyreSceneCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Scene (Photorealistic Studio & Pitlane Environment)
    this.scene = new THREE.Scene();

    // 2. Camera: FOV 32 with ample negative space to prevent clipping into UI
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 50);
    this.camera.position.copy(this.DEFAULT_CAM_POS);

    // 3. Renderer with transparent background for realistic track backdrop
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
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.65;
    this.controls.maxDistance = 3.6;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.02;
    this.controls.target.copy(this.DEFAULT_CAM_TARGET);
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.6;

    // 5. Lighting & Studio Environment (Controlled intensities so thermal colors never wash out)
    this.setupLighting();

    // 6. Hierarchy Setup for Concentric, Zero-Wobble Rotation
    // rootGroup holds the fixed axle position in the scene (X = 0.08)
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'HERO_TYRE_ROOT';
    this.rootGroup.position.set(0.08, 0, 0);

    // orientationGroup: cleanly aligned with camera framing (tread left, rim face right)
    this.orientationGroup = new THREE.Group();
    this.orientationGroup.name = 'ORIENTATION_NODE';
    this.orientationGroup.rotation.set(0, 0, 0);
    this.rootGroup.add(this.orientationGroup);

    // spinGroup rotates strictly around local Z-axis (the wheel's true geometric axle at 0, 0, 0)
    this.spinGroup = new THREE.Group();
    this.spinGroup.name = 'WHEEL_SPIN_AXLE_NODE';
    this.spinGroup.position.set(0, 0, 0);
    this.spinGroup.rotation.set(0, 0, 0);
    this.orientationGroup.add(this.spinGroup);

    // thermalZoneGroup sits at (0, 0, 0) on the wheel axle in orientationGroup.
    // It matches the wheel model's baseline orientation (rotation.z = Math.PI, scale = 0.92)
    // so the anchors sit precisely on the front-facing tread zones, but stays stationary while the wheel rolls.
    this.thermalZoneGroup = new THREE.Group();
    this.thermalZoneGroup.name = 'THERMAL_ZONE_GROUP';
    this.thermalZoneGroup.position.set(0, 0, 0);
    this.thermalZoneGroup.rotation.set(0, 0, 0);
    this.thermalZoneGroup.scale.set(1, 1, 1);
    this.orientationGroup.add(this.thermalZoneGroup);

    this.scene.add(this.rootGroup);

    // 7. Track & Floor System
    this.setupFloorGrid();

    // 8. Atmospheric fog for realistic depth falloff — road fades into the sky
    // well before the plane's far edge, creating an endless-road illusion
    this.scene.fog = new THREE.Fog(0xdfe6ef, 7.0, 26.0);

    // 8. Load GLB Tyre Asset
    this.loadTyreAsset();

    // 9. Event listeners
    this.bindEvents();

    // 10. Animation Loop
    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  private setupLighting(): void {
    // Ambient light: crisp, natural daylight (not washed out)
    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    this.scene.add(ambient);

    // Key Light (top right front) - natural daylight specular on rim and tread curve
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2.2, 3.5, 2.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Rim Light (rear left) - crisp studio edge definition
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
    rimLight.position.set(-2.8, 1.8, -2.2);
    this.scene.add(rimLight);

    // Fill Light (front left) - ensures tread thermal colors stay vivid and sharp
    const fillLight = new THREE.DirectionalLight(0xf1f5f9, 1.0);
    fillLight.position.set(-2.0, 1.8, 2.0);
    this.scene.add(fillLight);
  }

  private createAsphaltTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Base weathered bitumen tarmac (medium-dark race grey)
    ctx.fillStyle = '#24282f';
    ctx.fillRect(0, 0, 1024, 1024);

    // 1. Large-scale weathering mottling — irregular tonal patches from ageing & sweeping
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = 90 + Math.random() * 190;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = Math.random() > 0.5;
      g.addColorStop(0, dark ? 'rgba(10, 12, 16, 0.10)' : 'rgba(196, 206, 218, 0.05)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 2. Aggregate stone chips — basalt / granite / quartz mix
    const stoneCount = 60000;
    for (let i = 0; i < stoneCount; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const size = Math.random() * 1.9 + 0.5;
      const tone = Math.random();

      let color: string;
      if (tone > 0.92) {
        color = 'rgba(178, 188, 200, 0.42)'; // Light quartz flecks
      } else if (tone > 0.55) {
        color = 'rgba(92, 100, 112, 0.38)'; // Mid granite
      } else {
        color = 'rgba(14, 16, 21, 0.5)'; // Dark basalt / bitumen
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Transverse asphalt expansion joints / tar seam repairs crossing the road,
    // as seen on real circuit tarmac slabs
    const seamXs = [180, 540, 880];
    for (const sx of seamXs) {
      const wobble = Math.random() * 8 - 4;
      ctx.strokeStyle = 'rgba(8, 10, 14, 0.55)';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.bezierCurveTo(sx + wobble, 341, sx - wobble, 682, sx + wobble, 1024);
      ctx.stroke();
      // Sunlit raised edge of the repair
      ctx.strokeStyle = 'rgba(150, 158, 170, 0.14)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx + 3.5, 0);
      ctx.bezierCurveTo(sx + 3.5 + wobble, 341, sx + 3.5 - wobble, 682, sx + 3.5 + wobble, 1024);
      ctx.stroke();
    }

    // 4. Layered braking / traction skid marks — varied width, alpha and length
    for (let j = 0; j < 12; j++) {
      const yOffset = 120 + Math.random() * 780;
      const yWobble = 10 + Math.random() * 22;
      ctx.strokeStyle = `rgba(8, 10, 14, ${0.18 + Math.random() * 0.3})`;
      ctx.lineWidth = 5 + Math.random() * 16;
      ctx.beginPath();
      const x0 = Math.random() * 300;
      const x1 = x0 + 280 + Math.random() * 500;
      ctx.moveTo(x0, yOffset);
      ctx.bezierCurveTo((x0 + x1) * 0.4, yOffset + yWobble, (x0 + x1) * 0.7, yOffset - yWobble, x1, yOffset + (Math.random() * 8 - 4));
      ctx.stroke();
    }

    // 5. Soft central rubbering — subtle; the glossy macro racing-line strip sits on top
    const rubberGrad = ctx.createLinearGradient(0, 330, 0, 694);
    rubberGrad.addColorStop(0, 'rgba(12, 14, 18, 0)');
    rubberGrad.addColorStop(0.25, 'rgba(10, 12, 16, 0.30)');
    rubberGrad.addColorStop(0.5, 'rgba(6, 8, 11, 0.42)');
    rubberGrad.addColorStop(0.75, 'rgba(10, 12, 16, 0.30)');
    rubberGrad.addColorStop(1, 'rgba(12, 14, 18, 0)');
    ctx.fillStyle = rubberGrad;
    ctx.fillRect(0, 330, 1024, 364);

    // 6. Filled patch repairs — slightly different tone rectangles with darker border
    for (let p = 0; p < 2; p++) {
      const px = 60 + Math.random() * 700;
      const py = 60 + Math.random() * 700;
      const pw = 120 + Math.random() * 200;
      const ph = 90 + Math.random() * 160;
      ctx.fillStyle = 'rgba(52, 60, 70, 0.16)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(10, 12, 16, 0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, pw, ph);
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(4, 4);
    tex.anisotropy = maxAniso;
    return tex;
  }

  private createAsphaltBumpMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Mid-gray baseline
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // Stone bump heights
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random() * 2.2 + 0.5;
      const isHigh = Math.random() > 0.5;
      ctx.fillStyle = isHigh ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Recessed expansion joints aligned with the albedo seams
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 3;
    for (const sx of [90, 270, 440]) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, 512);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  private createAsphaltRoughnessMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Base roughness (~0.72): dusty weathered tarmac
    ctx.fillStyle = '#b8b8b8';
    ctx.fillRect(0, 0, 512, 512);

    // Rubber-polished skid streaks are noticeably glossier than off-line tarmac
    for (let j = 0; j < 8; j++) {
      const yOffset = Math.random() * 512;
      ctx.strokeStyle = `rgba(40, 40, 40, ${0.25 + Math.random() * 0.3})`;
      ctx.lineWidth = 4 + Math.random() * 12;
      ctx.beginPath();
      const x0 = Math.random() * 200;
      ctx.moveTo(x0, yOffset);
      ctx.lineTo(x0 + 250 + Math.random() * 250, yOffset + (Math.random() * 20 - 10));
      ctx.stroke();
    }

    // Central rubbered band slightly smoother overall
    const bandGrad = ctx.createLinearGradient(0, 128, 0, 384);
    bandGrad.addColorStop(0, 'rgba(80, 80, 80, 0)');
    bandGrad.addColorStop(0.5, 'rgba(80, 80, 80, 0.45)');
    bandGrad.addColorStop(1, 'rgba(80, 80, 80, 0)');
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, 128, 512, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  private createRacingLineAlphaMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Opaque polished core fading to transparent at the edges of the ribbon
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.78, 'rgba(255, 255, 255, 0.55)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  private createKerbTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const numStripes = 10;
    const stripeW = 1024 / numStripes;

    for (let i = 0; i < numStripes; i++) {
      const x = i * stripeW;
      const isRed = i % 2 === 0;

      // Base curb color
      ctx.fillStyle = isRed ? '#d90429' : '#f8fafc';
      ctx.fillRect(x, 0, stripeW, 256);

      // Concrete aggregate grain
      for (let g = 0; g < 400; g++) {
        const gx = x + Math.random() * stripeW;
        const gy = Math.random() * 256;
        ctx.fillStyle = isRed ? 'rgba(80, 0, 0, 0.15)' : 'rgba(100, 116, 139, 0.15)';
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }

      // Concrete curb bevel shading (top & bottom 3D chamfer gradient)
      const bevelGrad = ctx.createLinearGradient(x, 0, x, 256);
      bevelGrad.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
      bevelGrad.addColorStop(0.12, 'rgba(0, 0, 0, 0)');
      bevelGrad.addColorStop(0.88, 'rgba(0, 0, 0, 0)');
      bevelGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      ctx.fillStyle = bevelGrad;
      ctx.fillRect(x, 0, stripeW, 256);

      // Expansion joint groove between concrete curb blocks
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(x + stripeW - 2, 0, 3, 256);
    }

    // Heavy black tyre rubber scrubbing along the curb edge where tyres ride the apex
    const rubberScrub = ctx.createLinearGradient(0, 0, 0, 90);
    rubberScrub.addColorStop(0, 'rgba(10, 12, 16, 0.7)');
    rubberScrub.addColorStop(0.5, 'rgba(15, 18, 24, 0.4)');
    rubberScrub.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = rubberScrub;
    ctx.fillRect(0, 0, 1024, 90);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(2, 1);
    tex.anisotropy = 8;
    return tex;
  }

  private createAstroturfTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#14532d'; // Dark FIA racing green
    ctx.fillRect(0, 0, 256, 256);

    // Turf fibers
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = Math.random() > 0.5 ? '#166534' : '#0f3a1f';
      ctx.fillRect(x, y, 1.5, 3.5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2);
    return tex;
  }

  private setupFloorGrid(): void {
    // Full-length endless road: 90m along the rolling direction so the far edge
    // sits beyond the fog falloff and is never visible. Lateral width 24m easily
    // covers the camera frustum. Tiles stay physically sized: asphalt 6m, kerb 2.4m, turf 1.2m.
    const ROAD_LENGTH = 90.0;

    // 1. Ultra-Realistic Bitumen Asphalt Tarmac Ground Plane with aggregate bump and rubbering
    const asphaltTex = this.createAsphaltTexture();
    const asphaltBump = this.createAsphaltBumpMap();
    const asphaltRough = this.createAsphaltRoughnessMap();
    this.trackTexture = asphaltTex;
    asphaltTex.repeat.set(ROAD_LENGTH / 6.0, 4);
    asphaltBump.repeat.set(ROAD_LENGTH / 6.0, 4);
    asphaltRough.repeat.set(ROAD_LENGTH / 6.0, 4);

    const floorGeo = new THREE.PlaneGeometry(ROAD_LENGTH, 24.0);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xaeb4bc,
      map: asphaltTex,
      bumpMap: asphaltBump,
      bumpScale: 0.02,
      roughnessMap: asphaltRough,
      roughness: 1.0,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.334;
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 1b. Polished rubbered RACING LINE — the dark, glossy ideal-line ribbon that every
    // real F1 circuit carries; subtly reflective under broadcast lighting
    const racingLineGeo = new THREE.PlaneGeometry(ROAD_LENGTH, 1.6);
    const racingLineMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.34,
      metalness: 0.0,
      transparent: true,
      alphaMap: this.createRacingLineAlphaMap(),
      depthWrite: false,
    });
    const racingLineMesh = new THREE.Mesh(racingLineGeo, racingLineMat);
    racingLineMesh.rotation.x = -Math.PI / 2;
    racingLineMesh.position.set(0.08, -0.3335, 0);
    racingLineMesh.receiveShadow = true;
    this.scene.add(racingLineMesh);

    // 2. Realistic 3D Raised Chamfered Racing Kerb — full-length trackside edge line,
    // parallel to the rolling direction and clear of the tyre contact line (tyre spans z ∈ [-0.17, 0.17]).
    const kerbGeo = new THREE.BoxGeometry(ROAD_LENGTH, 0.024, 0.48);
    const kerbTex = this.createKerbTexture();
    this.kerbTexture = kerbTex;
    kerbTex.repeat.set(ROAD_LENGTH / 2.4, 1);
    const kerbMat = new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.68,
      metalness: 0.05,
    });
    const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
    kerbMesh.position.set(0.08, -0.322, -1.15);
    kerbMesh.rotation.y = 0; // parallel to the road so the tyre never rides the stripe
    kerbMesh.castShadow = true;
    kerbMesh.receiveShadow = true;
    this.scene.add(kerbMesh);

    // 3. Astroturf / Run-off Verge directly behind the kerb (full length, scrolls with the road)
    const turfTex = this.createAstroturfTexture();
    this.turfTexture = turfTex;
    turfTex.repeat.set(ROAD_LENGTH / 1.2, 2);
    const turfGeo = new THREE.PlaneGeometry(ROAD_LENGTH, 0.55);
    const turfMat = new THREE.MeshStandardMaterial({
      map: turfTex,
      roughness: 0.92,
      metalness: 0.02,
    });
    const turfMesh = new THREE.Mesh(turfGeo, turfMat);
    turfMesh.rotation.x = -Math.PI / 2;
    turfMesh.rotation.z = 0;
    turfMesh.position.set(0.08, -0.333, -1.67);
    turfMesh.receiveShadow = true;
    this.scene.add(turfMesh);

    // 4. Textured FIA Painted White Track Boundary Line (full road length; solid line
    // is visually identical at any x, so no scrolling needed)
    const lineGeo = new THREE.PlaneGeometry(ROAD_LENGTH, 0.06);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
    });
    const pitLine = new THREE.Mesh(lineGeo, lineMat);
    pitLine.rotation.x = -Math.PI / 2;
    pitLine.position.set(0.1, -0.332, 0.72);
    pitLine.receiveShadow = true;
    this.scene.add(pitLine);

    // 5. Yellow Pit Alignment / Timing Line
    const yellowLineGeo = new THREE.PlaneGeometry(2.4, 0.04);
    const yellowLineMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const yellowLine = new THREE.Mesh(yellowLineGeo, yellowLineMat);
    yellowLine.rotation.x = -Math.PI / 2;
    yellowLine.rotation.z = Math.PI / 2;
    yellowLine.position.set(-0.85, -0.332, 0.15);
    yellowLine.receiveShadow = true;
    this.scene.add(yellowLine);
    this.yellowLineMesh = yellowLine;

    // 6. Tyre Contact Patch Rubber Imprint directly on the road
    const rubberGeo = new THREE.PlaneGeometry(0.42, 0.28);
    const rubberCanvas = document.createElement('canvas');
    rubberCanvas.width = 128;
    rubberCanvas.height = 128;
    const rctx = rubberCanvas.getContext('2d')!;
    const rgrad = rctx.createRadialGradient(64, 64, 10, 64, 64, 60);
    rgrad.addColorStop(0, 'rgba(10, 12, 16, 0.85)');
    rgrad.addColorStop(0.7, 'rgba(12, 14, 18, 0.5)');
    rgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    rctx.fillStyle = rgrad;
    rctx.fillRect(0, 0, 128, 128);
    const rubberTex = new THREE.CanvasTexture(rubberCanvas);
    const rubberMat = new THREE.MeshBasicMaterial({
      map: rubberTex,
      transparent: true,
      opacity: 0.75,
    });
    const rubberMesh = new THREE.Mesh(rubberGeo, rubberMat);
    rubberMesh.rotation.x = -Math.PI / 2;
    rubberMesh.position.set(0, -0.332, 0);
    this.scene.add(rubberMesh);

    // 7. Realistic Multi-Stage Contact Patch Ambient Occlusion Shadow directly under tyre
    const shadowGeo = new THREE.PlaneGeometry(1.25, 0.62);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.65 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0, -0.331, 0);
    shadowPlane.receiveShadow = true;
    this.orientationGroup.add(shadowPlane);
  }

  private loadTyreAsset(): void {
    const loader = new GLTFLoader();
    const modelUrl = '/assets/models/F1 Front wheel.obj.glb';

    loader.load(
      modelUrl,
      (gltf) => {
        if (this.isDestroyed) return;
        const model = gltf.scene;
        model.name = 'F1_HERO_TYRE_MODEL';

        // Rotate 180° around Z so 'P ZERO' is at 12 o'clock (TOP) and 'IRELLI' is at 6 o'clock (BOTTOM)
        // Scale to 0.92 so tyre occupies ~58% of visualization height without clipping
        // CRITICAL: model position is (0, 0, 0) so the wheel rotates concentrically around its exact physical axle
        model.rotation.set(0, 0, Math.PI);
        model.position.set(0, 0, 0);
        model.scale.set(0.92, 0.92, 0.92);

        // Separate and configure authentic F1 materials
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            if (mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const upgradedMats: THREE.Material[] = [];

              mats.forEach((m) => {
                const stdMat = (m as THREE.MeshStandardMaterial).clone();
                upgradedMats.push(stdMat);

                const matName = stdMat.name || '';

                // Classification:
                // Prim 5 'Opaque(18,18,18)': Running Tread surface (Thermal Heatmap Target!)
                // Prim 3 'Opaque(20,20,20)': Sidewall rubber (STAYS DEEP MATTE BLACK)
                // Prim 1 & 4 'Opaque(178,154,0)': Pirelli / P Zero lettering (STAYS MOTORSPORT YELLOW)
                // Prim 2 'Opaque(255,222,135)': Central wheel nut (F1 RED/BLUE ANODIZED)
                // Prim 0 'Opaque(64,64,64)': BBS forged magnesium rim (DARK METALLIC)
                const isTread = matName.includes('18,18,18');
                const isSidewall = matName.includes('20,20,20');
                const isNut = matName.includes('255,222,135');
                const isLettering = matName.includes('178,154,0') || matName.includes('178,147,0');

                if (isTread) {
                  // Running tyre tread: deep carbon matte black slick rubber
                  stdMat.color.setHex(0x131417);
                  stdMat.roughness = 0.86;
                  stdMat.metalness = 0.08;
                  stdMat.emissive.setHex(0x000000);
                  stdMat.emissiveIntensity = 0.0;
                  this.treadMaterials.push(stdMat);

                  // INJECT THE THERMAL SHADER ONLY TO THE TREAD MATERIAL!
                  this.setupThermalShader(stdMat);
                } else if (isSidewall) {
                  // Sidewall: deep carbon black rubber, ALWAYS preserves contrast for Pirelli branding
                  stdMat.color.setHex(0x111215);
                  stdMat.roughness = 0.88;
                  stdMat.metalness = 0.06;
                  stdMat.emissive.setHex(0x000000);
                  stdMat.emissiveIntensity = 0.0;
                  this.sidewallMaterials.push(stdMat);
                } else if (isLettering) {
                  // Pirelli logo, P-Zero lettering, and checkered flag: crisp racing yellow
                  stdMat.color.setHex(0xfbbf24);
                  stdMat.roughness = 0.28;
                  stdMat.metalness = 0.14;
                  stdMat.emissive.setHex(0xeab308);
                  stdMat.emissiveIntensity = 0.25;
                  this.letteringMaterials.push(stdMat);
                } else if (isNut) {
                  // Central locking nut: F1 Red/Blue
                  const isLeft = this.activeCorner.endsWith('L');
                  stdMat.color.setHex(isLeft ? 0xef4444 : 0x0284c7);
                  stdMat.roughness = 0.18;
                  stdMat.metalness = 0.98;
                  this.hubNutMaterials.push(stdMat);
                } else {
                  // BBS Magnesium racing rim
                  stdMat.color.setHex(0x181a20);
                  stdMat.roughness = 0.22;
                  stdMat.metalness = 0.94;
                  this.rimMaterials.push(stdMat);
                }

                this.allWheelMaterials.push(stdMat);
              });

              mesh.material = Array.isArray(mesh.material) ? upgradedMats : upgradedMats[0];
            }
          }
        });

        // Attach 6 persistent 3D thermal anchors to the rotating model
        const DEG2RAD = Math.PI / 180;
        const R = 0.36;

        this.hotSpotAnchor.name = 'hotSpotAnchor';
        this.hotSpotAnchor.position.set(R * Math.cos(325 * DEG2RAD), R * Math.sin(325 * DEG2RAD), -0.16);

        this.innerShoulderAnchor.name = 'innerShoulderAnchor';
        this.innerShoulderAnchor.position.set(R * Math.cos(280 * DEG2RAD), R * Math.sin(280 * DEG2RAD), -0.09);

        this.surfaceTempAnchor.name = 'surfaceTempAnchor';
        this.surfaceTempAnchor.position.set(R * Math.cos(355 * DEG2RAD), R * Math.sin(355 * DEG2RAD), -0.04);

        this.treadCenterAnchor.name = 'treadCenterAnchor';
        this.treadCenterAnchor.position.set(R * Math.cos(355 * DEG2RAD), R * Math.sin(355 * DEG2RAD), 0.03);

        this.contactPatchAnchor.name = 'contactPatchAnchor';
        this.contactPatchAnchor.position.set(R * Math.cos(65 * DEG2RAD), R * Math.sin(65 * DEG2RAD), -0.06);

        this.outerShoulderAnchor.name = 'outerShoulderAnchor';
        this.outerShoulderAnchor.position.set(R * Math.cos(45 * DEG2RAD), R * Math.sin(45 * DEG2RAD), 0.16);

        this.thermalZoneGroup.add(this.hotSpotAnchor);
        this.thermalZoneGroup.add(this.innerShoulderAnchor);
        this.thermalZoneGroup.add(this.surfaceTempAnchor);
        this.thermalZoneGroup.add(this.treadCenterAnchor);
        this.thermalZoneGroup.add(this.contactPatchAnchor);
        this.thermalZoneGroup.add(this.outerShoulderAnchor);

        this.wheelModel = model;
        this.spinGroup.add(model);

        // Apply initial visual mode (THERMAL)
        this.applyVisualizationMode(this.visMode);
      },
      undefined,
      (err) => {
        console.warn('Failed to load F1 wheel asset, creating procedural slick:', err);
        this.buildProceduralFallback();
      }
    );
  }

  /**
   * Injects thermal colormap shader into tyre tread material.
   */
  private setupThermalShader(mat: THREE.MeshStandardMaterial): void {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uThermalActive = this.thermalUniforms.uThermalActive;
      shader.uniforms.uInnerShoulderTemp = this.thermalUniforms.uInnerShoulderTemp;
      shader.uniforms.uInnerTreadTemp = this.thermalUniforms.uInnerTreadTemp;
      shader.uniforms.uCenterTreadTemp = this.thermalUniforms.uCenterTreadTemp;
      shader.uniforms.uOuterTreadTemp = this.thermalUniforms.uOuterTreadTemp;
      shader.uniforms.uOuterShoulderTemp = this.thermalUniforms.uOuterShoulderTemp;
      shader.uniforms.uSurfaceTemp = this.thermalUniforms.uSurfaceTemp;
      shader.uniforms.uContactPatchHeat = this.thermalUniforms.uContactPatchHeat;
      shader.uniforms.uWheelAngle = this.thermalUniforms.uWheelAngle;

      shader.vertexShader = `
        ${thermalVertexShaderChunk}
        ${shader.vertexShader}
      `;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        thermalVertexShaderAssign
      );

      shader.fragmentShader = `
        ${thermalFragmentHeader}
        ${shader.fragmentShader}
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        thermalColorFragmentReplace
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        thermalEmissiveFragmentReplace
      );
    };
  }

  private buildProceduralFallback(): void {
    const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 48);
    tyreGeo.rotateX(Math.PI / 2);
    const tyreMat = new THREE.MeshStandardMaterial({
      color: 0x131417,
      roughness: 0.86,
      metalness: 0.08,
    });
    const tyreMesh = new THREE.Mesh(tyreGeo, tyreMat);
    tyreMesh.castShadow = true;
    this.spinGroup.add(tyreMesh);
    this.treadMaterials.push(tyreMat);
    this.setupThermalShader(tyreMat);
    this.allWheelMaterials.push(tyreMat);
  }

  private bindEvents(): void {
    const el = this.renderer.domElement;

    const onPointerMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      if (this.wheelModel) {
        const hits = this.raycaster.intersectObject(this.wheelModel, true);
        const hovered = hits.length > 0;
        if (hovered !== this.isHovered) {
          this.isHovered = hovered;
          el.style.cursor = hovered ? 'pointer' : 'default';
          this.callbacks.onHover?.(hovered);
        }
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (this.isHovered) {
        this.callbacks.onClick?.();
      }
    };

    el.addEventListener('mousemove', onPointerMove);
    el.addEventListener('click', onPointerDown);
  }

  public selectTyre(corner: TyreCorner | null): void {
    this.activeCorner = corner || 'FR';
    this.thermalSim.setCorner(this.activeCorner);
    const isLeft = this.activeCorner.endsWith('L');

    // F1 hub nut color: Red for Left (FL/RL), Blue for Right (FR/RR)
    this.hubNutMaterials.forEach((nut) => {
      nut.color.setHex(isLeft ? 0xef4444 : 0x3b82f6);
    });
  }

  public setVisualizationMode(mode: TyreVisMode): void {
    this.visMode = mode;
    this.applyVisualizationMode(mode);
  }

  public setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled;
  }

  public setRolling(enabled: boolean): void {
    this.isRolling = enabled;
  }

  public resetCamera(): void {
    this.transitionCameraTo(this.DEFAULT_CAM_POS, this.DEFAULT_CAM_TARGET);
  }

  public setCameraPreset(preset: CameraPreset): void {
    const target = this.DEFAULT_CAM_TARGET;
    switch (preset) {
      case 'HERO':
        this.transitionCameraTo(new THREE.Vector3(-2.05, 0.44, 1.10), target);
        break;
      case 'FRONT':
        // TREAD DIRECT VIEW
        this.transitionCameraTo(new THREE.Vector3(-1.75, 0.0, 0.08), target);
        break;
      case 'REAR':
        this.transitionCameraTo(new THREE.Vector3(0.08, 0.0, -1.75), target);
        break;
      case 'TOP':
        this.transitionCameraTo(new THREE.Vector3(0.08, 1.85, 0.0), target);
        break;
      case 'LEFT':
        // RIM FACE
        this.transitionCameraTo(new THREE.Vector3(0.08, 0.0, 1.75), target);
        break;
      case 'RIGHT':
        this.transitionCameraTo(new THREE.Vector3(1.75, 0.0, 0.08), target);
        break;
      case 'TYRE_FOCUS':
        // CLOSE-UP
        this.transitionCameraTo(new THREE.Vector3(-1.08, 0.26, 1.08), target);
        break;
    }
  }

  public transitionCameraTo(newPos: THREE.Vector3, newTarget: THREE.Vector3): void {
    this.startCameraPos.copy(this.camera.position);
    this.targetCameraPos.copy(newPos);
    this.startCameraTarget.copy(this.controls.target);
    this.targetCameraTarget.copy(newTarget);
    this.cameraAnimProgress = 0.0;
    this.isCameraTransitioning = true;
  }

  private applyVisualizationMode(mode: TyreVisMode): void {
    if (mode === 'THERMAL') {
      this.thermalUniforms.uThermalActive.value = 1.0;
    } else {
      this.thermalUniforms.uThermalActive.value = 0.0;

      // Sidewall is authentic dark matte rubber
      this.sidewallMaterials.forEach((mat) => {
        mat.color.setHex(0x111215);
        mat.roughness = 0.88;
        mat.metalness = 0.06;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0.0;
      });

      // Pirelli lettering is crisp motorsport yellow
      this.letteringMaterials.forEach((mat) => {
        mat.color.setHex(0xfbbf24);
        mat.roughness = 0.32;
      });

      if (mode === 'NORMAL') {
        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(0x131417);
          mat.roughness = 0.86;
          mat.metalness = 0.08;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        });
        if (this.contactPatchGlow) {
          (this.contactPatchGlow.material as THREE.MeshBasicMaterial).opacity = 0.0;
        }
      }
    }
  }

  /**
   * Called on every live telemetry frame (20 Hz)
   */
  public updateTelemetry(
    speedKph: number,
    _drs: number,
    dataMode: DataMode,
    fourWheelStates?: FourWheelTyres | null,
    telemetryFrame?: TelemetryFrame | null,
    physicsOutput?: PhysicsTwinOutput | null,
    tdiResponse?: TDIStateResponse | null
  ): void {
    const hasData = Boolean(telemetryFrame || physicsOutput || tdiResponse);
    this.currentSpeedKph = hasData ? Math.max(0, speedKph) : 0;
    this.lastTelemetryData = { speedKph, dataMode, fourWheelStates, telemetryFrame, physicsOutput, tdiResponse };

    const tyreState = calculateTyreCornerState(
      this.activeCorner,
      telemetryFrame ?? null,
      physicsOutput ?? null,
      tdiResponse ?? null,
      fourWheelStates ?? null,
      dataMode
    );

    const surfaceC = hasData ? (tyreState.thermal.surface_c ?? 0.0) : 0.0;

    if (this.visMode === 'THERMAL' && hasData && surfaceC > 0) {
      this.thermalUniforms.uThermalActive.value = 1.0;
    } else {
      this.thermalUniforms.uThermalActive.value = 0.0;
      // Ensure Sidewall remains authentic dark matte rubber in non-thermal modes
      this.sidewallMaterials.forEach((mat) => {
        mat.color.setHex(0x111215);
        mat.roughness = 0.88;
        mat.metalness = 0.06;
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0.0;
      });
    }

    // Dynamic handling across non-thermal visualization modes
    switch (this.visMode) {
      case 'NORMAL': {
        this.thermalUniforms.uThermalActive.value = 0.0;
        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(0x131417);
          mat.roughness = 0.86;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        });
        break;
      }

      case 'THERMAL': {
        this.thermalUniforms.uThermalActive.value = 1.0;
        if (this.contactPatchGlow) {
          const patchMat = this.contactPatchGlow.material as THREE.MeshBasicMaterial;
          patchMat.opacity = surfaceC > 105.0 ? 0.75 : 0.45;
          patchMat.color.setHex(surfaceC >= 115 ? 0xf50505 : 0xff7b00);
        }
        break;
      }

      case 'WEAR': {
        const wear = tyreState.wear.wear_pct;
        let wearColor = 0x141816;
        let emitColor = 0x10b981;
        let emitInt = 0.15;

        if (wear >= 60) {
          wearColor = 0x2e1417;
          emitColor = 0xef4444;
          emitInt = 0.7;
        } else if (wear >= 30) {
          wearColor = 0x221f14;
          emitColor = 0xf59e0b;
          emitInt = 0.35;
        }

        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(wearColor);
          mat.emissive.setHex(emitColor);
          mat.emissiveIntensity = emitInt;
          mat.roughness = 0.95;
        });
        break;
      }

      case 'LOAD': {
        const fz = tyreState.load.vertical_load_kn;
        const loadInt = Math.min(1.0, Math.max(0.15, (fz - 2.0) / 6.0));
        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(0x0e1c2a);
          mat.emissive.setHex(0x00f0ff);
          mat.emissiveIntensity = loadInt * 0.8;
        });
        break;
      }

      case 'GRIP': {
        const gripPct = tyreState.grip.available_grip_pct;
        let gripColor = 0x0f241a;
        let emitColor = 0x10b981;
        let emitInt = 0.35;

        if (gripPct <= 65) {
          gripColor = 0x2e1215;
          emitColor = 0xf43f5e;
          emitInt = 0.85;
        } else if (gripPct <= 80) {
          gripColor = 0x252312;
          emitColor = 0xeab308;
          emitInt = 0.55;
        }

        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(gripColor);
          mat.emissive.setHex(emitColor);
          mat.emissiveIntensity = emitInt;
        });
        break;
      }

      case 'PREDICTION': {
        const predHealth = tyreState.prediction.predicted_health_5_laps;
        this.treadMaterials.forEach((mat) => {
          mat.color.setHex(0x181424);
          mat.emissive.setHex(0xa855f7);
          mat.emissiveIntensity = 0.35 + (100 - predHealth) / 200;
        });
        break;
      }
    }

    // Contact patch force indicator on ground
    if (this.contactPatchGlow) {
      const patchMat = this.contactPatchGlow.material as THREE.MeshBasicMaterial;
      if (this.visMode === 'LOAD') {
        patchMat.opacity = Math.min(0.85, (tyreState.load.vertical_load_kn / 8.0) * 0.9);
        patchMat.color.setHex(0x00f0ff);
      } else if (this.visMode === 'GRIP' && tyreState.grip.available_grip_pct < 70) {
        patchMat.opacity = 0.7;
        patchMat.color.setHex(0xf43f5e);
      } else if (this.visMode !== 'THERMAL') {
        patchMat.opacity = 0.0;
      }
    }
  }

  public setSpeedMode(mode: 'REAL' | 'SLOWMO' | 'FREEZE'): void {
    this.speedMode = mode;
    this.isRolling = mode !== 'FREEZE';
    if (mode === 'FREEZE') {
      this.speedMultiplier = 0.0;
    } else if (mode === 'SLOWMO') {
      this.speedMultiplier = 0.08;
    } else {
      this.speedMultiplier = 1.0;
    }
  }

  public setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
    if (multiplier === 0) {
      this.speedMode = 'FREEZE';
      this.isRolling = false;
    } else if (multiplier < 0.25) {
      this.speedMode = 'SLOWMO';
      this.isRolling = true;
    } else {
      this.speedMode = 'REAL';
      this.isRolling = true;
    }
  }

  public getLiveRotationalVelocity(): { rad_s: number; rpm: number } {
    if (this.speedMode === 'FREEZE' || !this.isRolling || this.speedMultiplier <= 0) {
      return { rad_s: 0, rpm: 0 };
    }
    const speedKph = Math.max(0, this.currentSpeedKph);
    if (speedKph === 0) {
      return { rad_s: 0, rpm: 0 };
    }
    const speedMps = speedKph / 3.6;
    const omega = (speedMps / 0.36) * this.speedMultiplier;
    return {
      rad_s: Math.round(omega),
      rpm: Math.round((omega * 60) / (2 * Math.PI)),
    };
  }

  public handleResize(): void {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate(): void {
    if (this.isDestroyed) return;
    this.animId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();

    // 0. Physics Thermal Simulation Integration & Lerp Shader Uniforms
    // Use effective speed = raw telemetry speed × pace multiplier
    // so at 0.1x pace the tire runs cool (normal dark rubber) and
    // at 1x-2x pace the tire heats up into red/white-hot (like in reality)
    const effectiveSpeedKph = this.currentSpeedKph * Math.max(0, this.speedMultiplier);
    const physState = this.thermalSim.update(
      delta,
      effectiveSpeedKph,
      this.lastTelemetryData.telemetryFrame ?? null,
      this.lastTelemetryData.physicsOutput ?? null,
      this.lastTelemetryData.tdiResponse ?? null,
      this.lastTelemetryData.fourWheelStates ?? null,
      this.lastTelemetryData.dataMode
    );

    const lerpRate = Math.min(1.0, delta * 8.0);
    this.currentInnerShoulderTemp += (physState.innerShoulder - this.currentInnerShoulderTemp) * lerpRate;
    this.currentInnerTreadTemp += (physState.innerTread - this.currentInnerTreadTemp) * lerpRate;
    this.currentCenterTreadTemp += (physState.centerTread - this.currentCenterTreadTemp) * lerpRate;
    this.currentOuterTreadTemp += (physState.outerTread - this.currentOuterTreadTemp) * lerpRate;
    this.currentOuterShoulderTemp += (physState.outerShoulder - this.currentOuterShoulderTemp) * lerpRate;
    this.currentSurfaceTemp += (physState.surface - this.currentSurfaceTemp) * lerpRate;
    this.currentContactPatchHeat += (physState.contactPatchHeatIntensity - this.currentContactPatchHeat) * lerpRate;

    this.thermalUniforms.uInnerShoulderTemp.value = this.currentInnerShoulderTemp;
    this.thermalUniforms.uInnerTreadTemp.value = this.currentInnerTreadTemp;
    this.thermalUniforms.uCenterTreadTemp.value = this.currentCenterTreadTemp;
    this.thermalUniforms.uOuterTreadTemp.value = this.currentOuterTreadTemp;
    this.thermalUniforms.uOuterShoulderTemp.value = this.currentOuterShoulderTemp;
    this.thermalUniforms.uSurfaceTemp.value = this.currentSurfaceTemp;
    this.thermalUniforms.uContactPatchHeat.value = this.currentContactPatchHeat;
    this.thermalUniforms.uWheelAngle.value = this.wheelRotationAngle;

    // Dynamic thermal overlay intensity: fade in/out based on real surface temp
    // Below 35°C → 0.0 (normal dark rubber, no thermal colors)
    // 35-55°C → gradual fade-in (faint thermal glow emerging)
    // Above 55°C → 1.0 (full thermal visualization)
    if (this.visMode === 'THERMAL') {
      const thermalBlend = Math.min(1.0, Math.max(0.0, (this.currentSurfaceTemp - 35.0) / 20.0));
      this.thermalUniforms.uThermalActive.value = thermalBlend;
    }

    // 1. Concentric Real-Physics Wheel Roll around local Z-axis (Geometric Axle)
    // Formula: omega = v_mps / radius (r = 0.36m for F1 18-inch tyre)
    // Single-axis rotation only around Z-axis through center hub (0, 0, 0).
    // When speedMode is FREEZE, or isRolling is false, or velocity is 0: wheel remains completely stationary.
    if (this.isRolling && this.speedMode !== 'FREEZE' && this.speedMultiplier > 0) {
      const speedKph = Math.max(0, this.currentSpeedKph);
      if (speedKph > 0) {
        const speedMps = speedKph / 3.6;
        const realOmega = speedMps / 0.36; // Pure physical angular velocity in rad/s (omega = v / r)
        const scale = this.speedMode === 'SLOWMO' ? 0.08 : this.speedMultiplier;
        const omega = realOmega * scale;

        this.wheelRotationAngle -= omega * delta;
        this.spinGroup.rotation.z = this.wheelRotationAngle;

        // Scroll high-speed asphalt track under tyre contact patch (rolling-road conveyor).
        // Road surface must move backwards (-X) at exactly the tread speed for a
        // slip-free rolling contact: asphalt tile = 24m plane / 4 repeats = 6m,
        // so offset rate = speedMps / 6.0 (increasing offset shifts texture toward -X).
        if (this.trackTexture) {
          this.trackTexture.offset.x += (speedMps / 6.0) * delta * scale;
        }

        // Kerb stripes drift backwards with the road (tile = ROAD 90m / 37.5 repeats = 2.4m)
        if (this.kerbTexture) {
          this.kerbTexture.offset.x += (speedMps / 2.4) * delta * scale;
        }

        // Astroturf verge streams past with the road (tile = 90m / 75 repeats = 1.2m)
        if (this.turfTexture) {
          this.turfTexture.offset.x += (speedMps / 1.2) * delta * scale;
        }

        // Yellow pit timing line recedes with the traffic flow, recycled ahead of the
        // fog falloff so it streams past endlessly without visible pop-in
        if (this.yellowLineMesh) {
          this.yellowLineMesh.position.x -= speedMps * delta * scale;
          if (this.yellowLineMesh.position.x < -25) {
            this.yellowLineMesh.position.x = 25;
          }
        }

        // Dynamic High-Speed Motion Blur
        if (this.motionBlurMaterial) {
          if (speedKph > 35 && scale >= 0.4) {
            const blurStrength = Math.min(0.80, ((speedKph - 35) / 220) * 0.80 * Math.min(scale, 1.4));
            this.motionBlurMaterial.opacity = blurStrength;
          } else {
            this.motionBlurMaterial.opacity = 0.0;
          }
        }
      }
    }

    // 2. Camera Interpolation
    if (this.isCameraTransitioning) {
      this.cameraAnimProgress = Math.min(1.0, this.cameraAnimProgress + delta * 3.0);
      const t = 1 - Math.pow(1 - this.cameraAnimProgress, 3);
      this.camera.position.lerpVectors(this.startCameraPos, this.targetCameraPos, t);
      this.controls.target.lerpVectors(this.startCameraTarget, this.targetCameraTarget, t);
      if (this.cameraAnimProgress >= 1.0) {
        this.isCameraTransitioning = false;
      }
    }

    // 3. Update OrbitControls
    this.controls.update();

    // 4. Update 3D Thermal Callouts Tracking (60 FPS)
    if (this.callbacks.onCalloutsUpdate && this.container) {
      const callouts = this.computeThermalCallouts();
      this.callbacks.onCalloutsUpdate(callouts);
    }

    // 5. Render
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (err) {
      console.warn('WebGL render error:', err);
    }
  }

  public setRotationAngle(angleRad: number): void {
    this.wheelRotationAngle = angleRad;
    this.spinGroup.rotation.z = angleRad;
  }

  public computeThermalCallouts(): Record<string, ThermalCalloutPoint> {
    const width = this.container ? this.container.clientWidth : 1000;
    const height = Math.max(1, this.container ? this.container.clientHeight : 600);
    const res: Record<string, ThermalCalloutPoint> = {};

    // 1. Dynamic Camera-Facing Alignment
    // Tyre radius: 0.36m * 0.92 = 0.3312m
    const R = 0.3312;
    const camLocal = this.orientationGroup.worldToLocal(this.camera.position.clone());
    const camAngle = Math.atan2(camLocal.y, camLocal.x);

    // The circumferential thermal bands wrap 360° around the tyre.
    // Anchors are positioned dynamically on the camera-facing side so they are
    // 100% visible from any camera angle (front, rear, other side, close-up)
    // without ever rotating with the rolling wheel spin.
    const aHot = camAngle - 0.42;
    this.hotSpotAnchor.position.set(R * Math.cos(aHot), R * Math.sin(aHot), -0.1472);

    const aInner = camAngle - 0.72;
    this.innerShoulderAnchor.position.set(R * Math.cos(aInner), R * Math.sin(aInner), -0.0828);

    const aSurf = camAngle - 0.12;
    this.surfaceTempAnchor.position.set(R * Math.cos(aSurf), R * Math.sin(aSurf), -0.0368);

    const aCenter = camAngle + 0.12;
    this.treadCenterAnchor.position.set(R * Math.cos(aCenter), R * Math.sin(aCenter), 0.0276);

    const aOuter = camAngle + 0.46;
    this.outerShoulderAnchor.position.set(R * Math.cos(aOuter), R * Math.sin(aOuter), 0.1472);

    // Contact Patch is always at the bottom road contact interface
    this.contactPatchAnchor.position.set(0, -R, -0.055);

    const anchorsList: {
      id: 'hotSpot' | 'innerShoulder' | 'surfaceTemp' | 'treadCenter' | 'contactPatch' | 'outerShoulder';
      name: string;
      anchor: THREE.Object3D;
    }[] = [
      { id: 'hotSpot', name: 'HOT SPOT', anchor: this.hotSpotAnchor },
      { id: 'innerShoulder', name: 'INNER SHOULDER', anchor: this.innerShoulderAnchor },
      { id: 'surfaceTemp', name: 'SURFACE TEMP', anchor: this.surfaceTempAnchor },
      { id: 'treadCenter', name: 'TREAD CENTER', anchor: this.treadCenterAnchor },
      { id: 'contactPatch', name: 'CONTACT PATCH', anchor: this.contactPatchAnchor },
      { id: 'outerShoulder', name: 'OUTER SHOULDER', anchor: this.outerShoulderAnchor },
    ];

    for (const item of anchorsList) {
      const worldPos = new THREE.Vector3();
      item.anchor.getWorldPosition(worldPos);

      const proj = worldPos.clone().project(this.camera);
      const screenX = (proj.x + 1) * 0.5 * width;
      const screenY = (1 - proj.y) * 0.5 * height;
      const pctX = ((proj.x + 1) / 2) * 100;
      const pctY = ((-proj.y + 1) / 2) * 100;

      res[item.id] = {
        id: item.id,
        name: item.name,
        screenX,
        screenY,
        pctX,
        pctY,
        isOccluded: false,
        opacity: 1.0,
      };
    }

    return res;
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    this.controls.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
