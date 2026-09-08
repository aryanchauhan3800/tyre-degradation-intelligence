/**
 * TYRETRACE — Three.js 3D Race Car Digital Twin
 *
 * Implements a high-precision procedural single-seater race car with:
 * - CAR_ROOT, BODY, FRONT_WING, REAR_WING
 * - Four wheels: WHEEL_FL, WHEEL_FR, WHEEL_RL, WHEEL_RR
 * - Tyres: TYRE_FL, TYRE_FR, TYRE_RL, TYRE_RR
 * - Rims: RIM_FL, RIM_FR, RIM_RL, RIM_RR
 * - Smooth camera transitions between CAMERA_OVERVIEW and tyre-specific views
 * - Raycast hover & click detection
 * - Wheel rotation coupled to speed_kph
 * - DRS flap animation coupled to drs active flag
 * - Mode-aware tyre visualization (DEMO_SIMULATION heatmap vs REAL_REPLAY neutral slick)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { DataMode, FourWheelTyres, TyreCorner } from '../types/telemetry';

export interface SceneCallbacks {
  onSelectTyre: (corner: TyreCorner | null) => void;
  onHoverTyre: (corner: TyreCorner | null) => void;
}

export class RaceCarScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animId: number | null = null;

  // Hierarchical Scene Nodes
  public carRoot: THREE.Group;
  public bodyGroup: THREE.Group;
  public frontWingGroup: THREE.Group;
  public rearWingGroup: THREE.Group;
  public drsFlapMesh: THREE.Mesh | null = null;

  // Authentic Blender Car Model
  public blenderModel: THREE.Group | null = null;
  public blenderWheels: Record<TyreCorner, THREE.Object3D | null> = {
    FL: null,
    FR: null,
    RL: null,
    RR: null,
  };
  public blenderTyreMaterials: Record<TyreCorner, THREE.MeshStandardMaterial[]> = {
    FL: [],
    FR: [],
    RL: [],
    RR: [],
  };
  public blenderClickableMeshes: THREE.Mesh[] = [];

  // Wheels and Tyres
  public wheelNodes: Record<TyreCorner, THREE.Group>;
  public tyreMeshes: Record<TyreCorner, THREE.Mesh>;
  public tyreMaterials: Record<TyreCorner, THREE.MeshStandardMaterial>;
  public rimMeshes: Record<TyreCorner, THREE.Mesh>;
  public selectionRings: Record<TyreCorner, THREE.LineLoop>;


  // Camera Targets & Transitions
  private currentCameraPos: THREE.Vector3;
  private targetCameraPos: THREE.Vector3;
  private currentLookAt: THREE.Vector3;
  private targetLookAt: THREE.Vector3;
  private transitionAlpha = 1.0;
  private transitionSpeed = 3.5;

  // Interaction
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-1000, -1000);
  private hoveredCorner: TyreCorner | null = null;
  private selectedCorner: TyreCorner | null = null;
  private callbacks: SceneCallbacks;

  // Dynamic telemetry state
  private currentSpeedKph = 0;
  private wheelRotationAngle = 0;

  // Default positions
  private readonly OVERVIEW_POS = new THREE.Vector3(3.8, 2.2, 4.4);
  private readonly OVERVIEW_LOOKAT = new THREE.Vector3(0, 0.35, 0);

  private TYRE_POSITIONS: Record<TyreCorner, THREE.Vector3> = {
    FL: new THREE.Vector3(-0.88, 0.34, 1.45),
    FR: new THREE.Vector3(0.88, 0.34, 1.45),
    RL: new THREE.Vector3(-0.90, 0.37, -1.45),
    RR: new THREE.Vector3(0.90, 0.37, -1.45),
  };

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.08);

    // 2. Camera
    const aspect = container.clientWidth / Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 50);
    this.currentCameraPos = this.OVERVIEW_POS.clone();
    this.targetCameraPos = this.OVERVIEW_POS.clone();
    this.currentLookAt = this.OVERVIEW_LOOKAT.clone();
    this.targetLookAt = this.OVERVIEW_LOOKAT.clone();
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(this.currentLookAt);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Lighting
    this.setupLighting();

    // 5. Environment & Floor Grid
    this.setupFloorGrid();

    // 6. Build Procedural F1 Car Model
    this.carRoot = new THREE.Group();
    this.carRoot.name = 'CAR_ROOT';
    this.bodyGroup = new THREE.Group();
    this.frontWingGroup = new THREE.Group();
    this.rearWingGroup = new THREE.Group();

    this.wheelNodes = {} as Record<TyreCorner, THREE.Group>;
    this.tyreMeshes = {} as Record<TyreCorner, THREE.Mesh>;
    this.tyreMaterials = {} as Record<TyreCorner, THREE.MeshStandardMaterial>;
    this.rimMeshes = {} as Record<TyreCorner, THREE.Mesh>;
    this.selectionRings = {} as Record<TyreCorner, THREE.LineLoop>;

    this.buildCar();
    this.scene.add(this.carRoot);
    this.loadBlenderGlb();

    // 7. Event Listeners
    this.bindEvents();

    // 8. Start Render Loop
    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x2a3245, 1.2);
    this.scene.add(ambientLight);

    // Key Light (top front right)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.001;
    this.scene.add(keyLight);

    // Rim Light (low rear left) for dramatic motorsport silhouette
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    rimLight.position.set(-4, 3, -5);
    this.scene.add(rimLight);

    // Fill Light (underside aero diffuser glow)
    const fillLight = new THREE.PointLight(0x1e293b, 1.0, 10);
    fillLight.position.set(0, 0.2, 0);
    this.scene.add(fillLight);
  }

  private setupFloorGrid(): void {
    // Technical motorsport grid floor
    const gridHelper = new THREE.GridHelper(16, 32, 0x00f0ff, 0x1e293b);
    gridHelper.position.y = 0;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    this.scene.add(gridHelper);

    // Shadow catcher plane
    const planeGeo = new THREE.PlaneGeometry(16, 16);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.45 });
    const floor = new THREE.Mesh(planeGeo, planeMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildCar(): void {
    // Material Palette
    const carbonLivery = new THREE.MeshStandardMaterial({
      color: 0x12141a,
      roughness: 0.35,
      metalness: 0.8,
    });
    const accentCyan = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      roughness: 0.2,
      metalness: 0.9,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x242833,
      roughness: 0.5,
      metalness: 0.85,
    });

    // --- 1. CHASSIS / MONOCOQUE ---
    this.bodyGroup.name = 'BODY';

    // Main Cockpit Tub
    const tubGeo = new THREE.BoxGeometry(0.72, 0.46, 2.2);
    const tub = new THREE.Mesh(tubGeo, carbonLivery);
    tub.position.set(0, 0.38, 0);
    tub.castShadow = true;
    this.bodyGroup.add(tub);

    // Nosecone (tapered wedge extending forward to front wing)
    const noseGeo = new THREE.ConeGeometry(0.32, 1.4, 4);
    const nose = new THREE.Mesh(noseGeo, carbonLivery);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.32, 1.7);
    nose.scale.set(1.0, 0.65, 1.0);
    nose.castShadow = true;
    this.bodyGroup.add(nose);

    // Sidepods (Left & Right sculpted aerodynamic pods)
    const sidepodGeo = new THREE.BoxGeometry(0.32, 0.38, 1.5);
    const leftSidepod = new THREE.Mesh(sidepodGeo, carbonLivery);
    leftSidepod.position.set(-0.52, 0.32, -0.1);
    leftSidepod.castShadow = true;
    this.bodyGroup.add(leftSidepod);

    const rightSidepod = leftSidepod.clone();
    rightSidepod.position.set(0.52, 0.32, -0.1);
    this.bodyGroup.add(rightSidepod);

    // Livery Pinstripes
    const stripeGeo = new THREE.BoxGeometry(0.04, 0.02, 2.0);
    const leftStripe = new THREE.Mesh(stripeGeo, accentCyan);
    leftStripe.position.set(-0.67, 0.48, -0.1);
    this.bodyGroup.add(leftStripe);

    const rightStripe = leftStripe.clone();
    rightStripe.position.set(0.67, 0.48, -0.1);
    this.bodyGroup.add(rightStripe);

    // Engine Airbox & Shark Fin
    const airboxGeo = new THREE.BoxGeometry(0.3, 0.35, 1.1);
    const airbox = new THREE.Mesh(airboxGeo, carbonLivery);
    airbox.position.set(0, 0.68, -0.4);
    airbox.castShadow = true;
    this.bodyGroup.add(airbox);

    const finGeo = new THREE.BufferGeometry();
    const finVertices = new Float32Array([
      0, 0.85, -0.1,
      0, 0.55, -1.3,
      0, 0.85, -1.3,
    ]);
    finGeo.setAttribute('position', new THREE.BufferAttribute(finVertices, 3));
    finGeo.computeVertexNormals();
    const sharkFin = new THREE.Mesh(finGeo, accentCyan);
    this.bodyGroup.add(sharkFin);

    // Cockpit Halo Ring
    const haloCurve = new THREE.TorusGeometry(0.24, 0.035, 8, 16, Math.PI);
    const halo = new THREE.Mesh(haloCurve, darkMetal);
    halo.rotation.x = -Math.PI / 2 + 0.2;
    halo.position.set(0, 0.63, 0.35);
    this.bodyGroup.add(halo);

    const haloCenterStrut = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
    const haloStrut = new THREE.Mesh(haloCenterStrut, darkMetal);
    haloStrut.position.set(0, 0.52, 0.55);
    this.bodyGroup.add(haloStrut);

    this.carRoot.add(this.bodyGroup);

    // --- 2. FRONT WING ---
    this.frontWingGroup.name = 'FRONT_WING';
    const fwMainGeo = new THREE.BoxGeometry(1.8, 0.03, 0.45);
    const fwMain = new THREE.Mesh(fwMainGeo, carbonLivery);
    fwMain.position.set(0, 0.14, 2.3);
    fwMain.castShadow = true;
    this.frontWingGroup.add(fwMain);

    // Front Wing Endplates
    const fwEndplateGeo = new THREE.BoxGeometry(0.02, 0.24, 0.5);
    const fwEndL = new THREE.Mesh(fwEndplateGeo, accentCyan);
    fwEndL.position.set(-0.9, 0.22, 2.3);
    this.frontWingGroup.add(fwEndL);

    const fwEndR = fwEndL.clone();
    fwEndR.position.set(0.9, 0.22, 2.3);
    this.frontWingGroup.add(fwEndR);

    this.carRoot.add(this.frontWingGroup);

    // --- 3. REAR WING ---
    this.rearWingGroup.name = 'REAR_WING';
    // Pylons
    const pylonGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
    const pylonL = new THREE.Mesh(pylonGeo, darkMetal);
    pylonL.position.set(-0.16, 0.65, -1.85);
    this.rearWingGroup.add(pylonL);

    const pylonR = pylonL.clone();
    pylonR.position.set(0.16, 0.65, -1.85);
    this.rearWingGroup.add(pylonR);

    // Mainplane
    const rwMainGeo = new THREE.BoxGeometry(1.4, 0.04, 0.35);
    const rwMain = new THREE.Mesh(rwMainGeo, carbonLivery);
    rwMain.position.set(0, 0.92, -1.85);
    rwMain.castShadow = true;
    this.rearWingGroup.add(rwMain);

    // DRS Flap (rotates open when DRS active)
    const drsGeo = new THREE.BoxGeometry(1.38, 0.025, 0.22);
    this.drsFlapMesh = new THREE.Mesh(drsGeo, accentCyan);
    this.drsFlapMesh.position.set(0, 0.98, -1.88);
    this.rearWingGroup.add(this.drsFlapMesh);

    // Rear Endplates
    const rwEndGeo = new THREE.BoxGeometry(0.02, 0.45, 0.55);
    const rwEndL = new THREE.Mesh(rwEndGeo, carbonLivery);
    rwEndL.position.set(-0.7, 0.85, -1.85);
    this.rearWingGroup.add(rwEndL);

    const rwEndR = rwEndL.clone();
    rwEndR.position.set(0.7, 0.85, -1.85);
    this.rearWingGroup.add(rwEndR);

    this.carRoot.add(this.rearWingGroup);

    // --- 4. FOUR WHEEL ASSEMBLIES ---
    const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
    for (const corner of corners) {
      const isFront = corner.startsWith('F');
      const isLeft = corner.endsWith('L');

      const wheelGroup = new THREE.Group();
      wheelGroup.name = `WHEEL_${corner}`;
      wheelGroup.position.copy(this.TYRE_POSITIONS[corner]);

      // Tyre Geometry: Cylinder oriented along X-axis
      const radius = isFront ? 0.34 : 0.36;
      const width = isFront ? 0.28 : 0.36;
      const tyreGeo = new THREE.CylinderGeometry(radius, radius, width, 32);
      tyreGeo.rotateZ(Math.PI / 2);

      const tyreMat = new THREE.MeshStandardMaterial({
        color: 0x171920,
        roughness: 0.85,
        metalness: 0.15,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0.0,
      });

      const tyreMesh = new THREE.Mesh(tyreGeo, tyreMat);
      tyreMesh.name = `TYRE_${corner}`;
      tyreMesh.castShadow = true;
      tyreMesh.userData = { corner };
      wheelGroup.add(tyreMesh);

      // BBS Magnesium Rim
      const rimRadius = radius * 0.58;
      const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.005, 18);
      rimGeo.rotateZ(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x1f242e,
        roughness: 0.3,
        metalness: 0.9,
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.name = `RIM_${corner}`;
      wheelGroup.add(rimMesh);

      // Central Hub Nut (Red for left, Blue for right like F1 pit stops)
      const nutColor = isLeft ? 0xef4444 : 0x3b82f6;
      const nutGeo = new THREE.CylinderGeometry(0.04, 0.04, width + 0.02, 8);
      nutGeo.rotateZ(Math.PI / 2);
      const nutMat = new THREE.MeshBasicMaterial({ color: nutColor });
      const nut = new THREE.Mesh(nutGeo, nutMat);
      wheelGroup.add(nut);

      // Suspension Wishbones (connecting wheel hub to body)
      const wishboneGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6);
      const upperWishbone = new THREE.Mesh(wishboneGeo, darkMetal);
      upperWishbone.rotation.z = isLeft ? 0.3 : -0.3;
      upperWishbone.position.set(isLeft ? 0.25 : -0.25, 0.08, 0);
      wheelGroup.add(upperWishbone);

      // Technical Selection / Hover Ring (bounding bracket)
      const ringGeo = new THREE.BufferGeometry();
      const ringSegments = 32;
      const ringPoints: THREE.Vector3[] = [];
      const ringRad = radius + 0.05;
      for (let i = 0; i <= ringSegments; i++) {
        const theta = (i / ringSegments) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(isLeft ? -width / 2 - 0.02 : width / 2 + 0.02, Math.sin(theta) * ringRad, Math.cos(theta) * ringRad));
      }
      ringGeo.setFromPoints(ringPoints);
      const ringMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.0 });
      const selectionRing = new THREE.LineLoop(ringGeo, ringMat);
      wheelGroup.add(selectionRing);

      this.carRoot.add(wheelGroup);

      this.wheelNodes[corner] = wheelGroup;
      this.tyreMeshes[corner] = tyreMesh;
      this.tyreMaterials[corner] = tyreMat;
      this.rimMeshes[corner] = rimMesh;
      this.selectionRings[corner] = selectionRing;
    }
  }

  private loadBlenderGlb(): void {
    const loader = new GLTFLoader();
    loader.load(
      '/models/f2_car.glb',
      (gltf) => {
        const model = gltf.scene;
        model.name = 'BLENDER_F2_CAR';
        // Formula 2 Blender digital twin geometry:
        // Length ~9.26m in raw coordinates -> scaled by 0.44 = ~4.07m
        // Rotate -90 deg on Y to align with Three.js car heading (+Z forward)
        model.rotation.y = -Math.PI / 2;
        model.scale.set(0.44, 0.44, 0.44);
        model.position.set(0, 0, 0);

        // Hide procedural fallback car components
        this.bodyGroup.visible = false;
        this.frontWingGroup.visible = false;
        this.rearWingGroup.visible = false;
        const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
        for (const c of corners) {
          if (this.wheelNodes[c]) {
            this.wheelNodes[c].visible = false;
          }
        }

        // Traverse Blender model hierarchy to map wheels, tyres, and interactive meshes
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            for (const corner of corners) {
              const matchesCorner =
                mesh.name.includes(`_${corner}`) ||
                (mesh.parent && mesh.parent.name.includes(`_${corner}`));

              if (matchesCorner) {
                mesh.userData = { corner };
                this.blenderClickableMeshes.push(mesh);

                if (mesh.material) {
                  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                  for (const m of mats) {
                    if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                      this.blenderTyreMaterials[corner].push(m as THREE.MeshStandardMaterial);
                    }
                  }
                }
              }
            }
          }

          for (const corner of corners) {
            if (child.name === `Wheel_${corner}`) {
              this.blenderWheels[corner] = child;
            }
          }
        });

        this.blenderModel = model;
        this.carRoot.add(model);
        model.updateMatrixWorld(true);

        for (const corner of corners) {
          const wChild = this.blenderWheels[corner];
          if (wChild) {
            const center = new THREE.Vector3();
            wChild.getWorldPosition(center);
            if (!isNaN(center.x) && !isNaN(center.y) && !isNaN(center.z) && (center.x !== 0 || center.z !== 0)) {
              this.TYRE_POSITIONS[corner].copy(center);
            }
          }
        }
        this.updateVisualHighlights();
      },
      undefined,
      (err) => {
        console.warn('Fallback to procedural race car geometry:', err);
      }
    );
  }

  private bindEvents(): void {
    const el = this.renderer.domElement;

    const onPointerMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const tyreMeshList = [
        ...Object.values(this.tyreMeshes),
        ...this.blenderClickableMeshes,
      ];
      const intersects = this.raycaster.intersectObjects(tyreMeshList, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const corner = hit.userData.corner as TyreCorner;
        if (corner && this.hoveredCorner !== corner) {
          this.hoveredCorner = corner;
          el.style.cursor = 'pointer';
          this.callbacks.onHoverTyre(corner);
          this.updateVisualHighlights();
        }
      } else {
        if (this.hoveredCorner !== null) {
          this.hoveredCorner = null;
          el.style.cursor = 'default';
          this.callbacks.onHoverTyre(null);
          this.updateVisualHighlights();
        }
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const tyreMeshList = [
        ...Object.values(this.tyreMeshes),
        ...this.blenderClickableMeshes,
      ];
      const intersects = this.raycaster.intersectObjects(tyreMeshList, false);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        const corner = hit.userData.corner as TyreCorner;
        if (corner) {
          this.selectTyre(corner);
        }
      }
    };

    el.addEventListener('mousemove', onPointerMove);
    el.addEventListener('click', onPointerDown);
  }

  public selectTyre(corner: TyreCorner | null): void {
    this.selectedCorner = corner;
    this.callbacks.onSelectTyre(corner);

    if (corner) {
      // Focus camera on selected tyre
      const tyrePos = this.TYRE_POSITIONS[corner];
      const isLeft = corner.endsWith('L');
      const isFront = corner.startsWith('F');

      const offsetX = isLeft ? -1.1 : 1.1;
      const offsetY = 0.55;
      const offsetZ = isFront ? 0.9 : -0.9;

      this.targetCameraPos.set(tyrePos.x + offsetX, tyrePos.y + offsetY, tyrePos.z + offsetZ);
      this.targetLookAt.copy(tyrePos);
      this.transitionAlpha = 0.0;
    } else {
      this.resetCamera();
    }

    this.updateVisualHighlights();
  }

  public resetCamera(): void {
    this.selectedCorner = null;
    this.targetCameraPos.copy(this.OVERVIEW_POS);
    this.targetLookAt.copy(this.OVERVIEW_LOOKAT);
    this.transitionAlpha = 0.0;
    this.callbacks.onSelectTyre(null);
    this.updateVisualHighlights();
  }

  private updateVisualHighlights(): void {
    const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
    for (const c of corners) {
      const ring = this.selectionRings[c];
      const isSelected = this.selectedCorner === c;
      const isHovered = this.hoveredCorner === c;

      if (ring) {
        const mat = ring.material as THREE.LineBasicMaterial;
        if (isSelected) {
          mat.opacity = 1.0;
          mat.color.setHex(0x00f0ff);
        } else if (isHovered) {
          mat.opacity = 0.7;
          mat.color.setHex(0x38bdf8);
        } else {
          mat.opacity = 0.0;
        }
      }

      // Also highlight Blender tyre materials
      const bMats = this.blenderTyreMaterials[c];
      if (bMats && bMats.length > 0) {
        for (const bMat of bMats) {
          if (isSelected) {
            bMat.emissive.setHex(0x00f0ff);
            bMat.emissiveIntensity = 0.45;
          } else if (isHovered) {
            bMat.emissive.setHex(0x38bdf8);
            bMat.emissiveIntensity = 0.25;
          } else {
            bMat.emissive.setHex(0x000000);
            bMat.emissiveIntensity = 0.0;
          }
        }
      }
    }
  }

  /**
   * Updates dynamic telemetry attributes from backend stream.
   */
  public updateTelemetry(
    speedKph: number,
    drs: number,
    dataMode: DataMode,
    fourWheelStates?: FourWheelTyres | null
  ): void {
    this.currentSpeedKph = speedKph;

    // DRS Flap rotation
    if (this.drsFlapMesh) {
      const targetAngle = drs > 0 ? -0.38 : 0.0; // ~22 degrees open
      this.drsFlapMesh.rotation.x = THREE.MathUtils.lerp(this.drsFlapMesh.rotation.x, targetAngle, 0.2);
    }

    // Tyre Heatmap / Wear Shader handling
    const corners: TyreCorner[] = ['FL', 'FR', 'RL', 'RR'];
    for (const corner of corners) {
      const mat = this.tyreMaterials[corner];
      if (mat) {
        if (dataMode === 'DEMO_SIMULATION' && fourWheelStates && fourWheelStates[corner]?.tdi !== null) {
          // DEMO_SIMULATION Mode: map TDI to visual thermal intensity
          const tdi = fourWheelStates[corner].tdi || 0;
          this.applyThermalColor(mat, tdi);
        } else {
          // REAL_REPLAY Mode: STRICTLY PRESERVE NEUTRAL MATTE SLICK
          mat.color.setHex(0x171920);
          mat.roughness = 0.85;
          mat.metalness = 0.15;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0.0;
        }
      }

      // Blender Tyre Materials
      const bMats = this.blenderTyreMaterials[corner];
      if (bMats && bMats.length > 0) {
        for (const bMat of bMats) {
          if (dataMode === 'DEMO_SIMULATION' && fourWheelStates && fourWheelStates[corner]?.tdi !== null) {
            const tdi = fourWheelStates[corner].tdi || 0;
            this.applyThermalColor(bMat, tdi);
          } else {
            // REAL_REPLAY Mode: keep authentic slick unless selected/hovered
            if (this.selectedCorner === corner) {
              bMat.emissive.setHex(0x00f0ff);
              bMat.emissiveIntensity = 0.45;
            } else if (this.hoveredCorner === corner) {
              bMat.emissive.setHex(0x38bdf8);
              bMat.emissiveIntensity = 0.25;
            } else {
              bMat.emissive.setHex(0x000000);
              bMat.emissiveIntensity = 0.0;
            }
          }
        }
      }
    }
  }

  private applyThermalColor(mat: THREE.MeshStandardMaterial, tdi: number): void {
    // 0-20: Healthy dark rubber with subtle green glow
    // 21-40: Early degradation (yellow-green)
    // 41-60: Moderate degradation (amber heat)
    // 61-80: High degradation (orange-red)
    // 81-100: Severe degradation (crimson thermal blister)
    if (tdi <= 20) {
      mat.color.setHex(0x171920);
      mat.emissive.setHex(0x10b981);
      mat.emissiveIntensity = (tdi / 20.0) * 0.15;
    } else if (tdi <= 40) {
      mat.color.setHex(0x20261e);
      mat.emissive.setHex(0x84cc16);
      mat.emissiveIntensity = 0.15 + ((tdi - 20) / 20.0) * 0.2;
    } else if (tdi <= 60) {
      mat.color.setHex(0x2a2416);
      mat.emissive.setHex(0xf59e0b);
      mat.emissiveIntensity = 0.35 + ((tdi - 40) / 20.0) * 0.25;
    } else if (tdi <= 80) {
      mat.color.setHex(0x361c16);
      mat.emissive.setHex(0xf97316);
      mat.emissiveIntensity = 0.6 + ((tdi - 60) / 20.0) * 0.25;
    } else {
      mat.color.setHex(0x400f18);
      mat.emissive.setHex(0xef4444);
      mat.emissiveIntensity = 0.85 + Math.min(0.3, ((tdi - 80) / 20.0) * 0.3);
    }
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
    this.animId = requestAnimationFrame(this.animate);

    // 1. Wheel Rotation (coupled to vehicle speed_kph)
    // omega = (v_kph / 3.6) / r
    if (typeof this.currentSpeedKph === 'number' && !isNaN(this.currentSpeedKph) && this.currentSpeedKph > 0.5) {
      const speedMps = this.currentSpeedKph / 3.6;
      const dTheta = (speedMps / 0.35) * 0.016; // approx 60fps delta
      this.wheelRotationAngle -= dTheta;

      for (const corner of ['FL', 'FR', 'RL', 'RR'] as TyreCorner[]) {
        const tyre = this.tyreMeshes[corner];
        const rim = this.rimMeshes[corner];
        if (tyre) tyre.rotation.x = this.wheelRotationAngle;
        if (rim) rim.rotation.x = this.wheelRotationAngle;

        // Blender wheels
        const bWheel = this.blenderWheels[corner];
        if (bWheel) {
          const isLeft = corner.endsWith('L');
          bWheel.rotation.z += isLeft ? dTheta : -dTheta;
        }
      }
    }

    // 2. Smooth Camera Interpolation
    if (this.transitionAlpha < 1.0) {
      this.transitionAlpha = Math.min(1.0, this.transitionAlpha + 0.016 * this.transitionSpeed);
      const t = this.transitionAlpha * this.transitionAlpha * (3 - 2 * this.transitionAlpha);

      if (!isNaN(this.targetCameraPos.x) && !isNaN(this.targetLookAt.x)) {
        this.currentCameraPos.lerpVectors(this.currentCameraPos, this.targetCameraPos, 0.08 + t * 0.1);
        this.currentLookAt.lerpVectors(this.currentLookAt, this.targetLookAt, 0.08 + t * 0.1);

        this.camera.position.copy(this.currentCameraPos);
        this.camera.lookAt(this.currentLookAt);
      }
    }

    // 3. Render
    try {
      this.renderer.render(this.scene, this.camera);
    } catch (renderErr) {
      // Guard against WebGL context interruption
      console.warn('WebGL render cycle warning:', renderErr);
    }
  }

  public destroy(): void {
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
