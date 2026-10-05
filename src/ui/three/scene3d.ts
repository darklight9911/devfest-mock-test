import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AppEvent, AppState, ClickMode } from '../../state/store';
import type { Building, BuildingNode, RouteResult } from '../../types';
import {
  COLORS,
  NODE_SIZE,
  TextureKit,
  buildBarrier,
  buildExit,
  buildFire,
  buildJunction,
  buildRoom,
  costTag,
  nameTag,
  standard,
  type ExitParts,
  type Side,
} from './assets';
import { Evacuee } from './evacuee';

export interface SceneHandlers {
  onNode(id: string): void;
  onEdge(id: string): void;
}

interface NodeView {
  node: BuildingNode;
  group: THREE.Group;
  position: THREE.Vector3;
  floor: THREE.MeshStandardMaterial;
  baseColor: number;
  fire: THREE.Group | null;
  exit: ExitParts | null;
}

interface EdgeView {
  cost: number;
  material: THREE.MeshStandardMaterial;
  barrier: THREE.Group;
  tag: THREE.Sprite;
}

/** World length given to the shortest corridor, and the largest allowed world span. */
const SHORTEST_CORRIDOR = 10;
const MAX_SPAN = 70;
const POP_SECONDS = 0.28;
const CLICK_TOLERANCE_PX = 6;

/**
 * The optional 3D view. It reads the same store state as the 2D map and never computes routes
 * itself: it only draws what the routing code decided, so both views always agree.
 */
export class Scene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  private readonly controls: OrbitControls;
  private readonly kit = new TextureKit();
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resizeObserver: ResizeObserver;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly hitMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });

  private world = new THREE.Group();
  private building: Building | null = null;
  private nodes = new Map<string, NodeView>();
  private edges = new Map<string, EdgeView>();
  private pickables: THREE.Object3D[] = [];
  private span = 20;
  /** World width (x) and depth (y = world z) of the building. */
  private extent = new THREE.Vector2(20, 20);
  private nodeScale = 1;

  private readonly startRing: THREE.Mesh;
  private readonly beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  private readonly hoverRing: THREE.Mesh;
  private readonly evacuee = new Evacuee();
  private routeRibbon: THREE.Group | null = null;
  private drillRibbon: THREE.Group | null = null;
  private routeKey = '';
  private drillKey = '';
  private flowTextures: THREE.Texture[] = [];

  private prevNodeState = new Map<string, string>();
  private prevEdgeState = new Map<string, string>();
  private evacueeAt: string | null = null;
  private evacueeDisplaced = false;
  private pops = new Map<THREE.Object3D, { t: number; base: number }>();
  private time = 0;

  private mode: ClickMode = 'start';
  private drillActive = false;
  private downAt: { x: number; y: number } | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly handlers: SceneHandlers,
  ) {
    // Throws when WebGL is unavailable; the caller shows a fallback message.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.classList.add('game-canvas');
    host.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.background);
    this.scene.fog = new THREE.Fog(COLORS.background, 80, 200);
    this.scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 1.2));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.startRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.75, 0.09, 12, 64),
      new THREE.MeshBasicMaterial({ color: COLORS.start, toneMapped: false }),
    );
    this.startRing.rotation.x = -Math.PI / 2;
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 7, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: COLORS.beacon,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.8, 48),
      new THREE.MeshBasicMaterial({
        color: COLORS.hover,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.hoverRing.rotation.x = -Math.PI / 2;
    for (const object of [this.startRing, this.beacon, this.hoverRing, this.evacuee.group]) {
      object.visible = false;
      this.scene.add(object);
    }
    this.scene.add(this.world);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minDistance = 6;

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  // ---- Lifecycle --------------------------------------------------------------------

  /** Runs the render loop only while the 3D view is on screen. */
  setActive(active: boolean): void {
    if (active) {
      this.clock.getDelta();
      this.resize();
      this.renderer.setAnimationLoop(this.tick);
    } else {
      this.renderer.setAnimationLoop(null);
    }
  }

  setAriaLabel(label: string): void {
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', label);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.clearWorld();
    this.evacuee.dispose();
    this.kit.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /**
   * Frames the whole building. The camera direction is fixed; the distance is binary-searched
   * until every corner of the building's bounding box (plus a margin) projects inside the view.
   */
  resetCamera(): void {
    const elevation = THREE.MathUtils.degToRad(55);
    // On a portrait screen, turn a wide building so its long side runs down the screen.
    const turn = this.camera.aspect < 0.9 && this.extent.x > this.extent.y * 1.2;
    const azimuth = THREE.MathUtils.degToRad(turn ? 78 : -12);
    const direction = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    );
    const target = new THREE.Vector3(0, 0.6, 0);
    const halfX = this.extent.x / 2 + 2.2 * this.nodeScale + 0.8;
    const halfZ = this.extent.y / 2 + 2.2 * this.nodeScale + 0.8;
    const corners: THREE.Vector3[] = [];
    for (const x of [-halfX, halfX]) {
      for (const z of [-halfZ, halfZ]) {
        for (const y of [0, 4.6 * this.nodeScale]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    const fits = (distance: number): boolean => {
      this.camera.position.copy(direction).multiplyScalar(distance).add(target);
      this.camera.lookAt(target);
      this.camera.updateMatrixWorld();
      return corners.every((corner) => {
        const p = corner.clone().project(this.camera);
        return Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.9 && p.z < 1;
      });
    };
    let near = 4;
    let far = 4;
    while (!fits(far) && far < 2000) far *= 2;
    for (let i = 0; i < 24; i++) {
      const middle = (near + far) / 2;
      if (fits(middle)) far = middle;
      else near = middle;
    }
    this.camera.position.copy(direction).multiplyScalar(far).add(target);
    this.controls.target.copy(target);
    this.controls.maxDistance = far * 2.2;
    this.controls.update();
  }

  /** Walks the evacuee along the lowest-cost route (a visual only; routing is unchanged). */
  runEvacuation(path: string[]): void {
    const points = path.map((id) => this.nodes.get(id)?.position).filter((p) => p !== undefined);
    if (points.length < 2) return;
    this.evacueeDisplaced = true;
    this.evacuee.walkAlong(points, this.reducedMotion.matches, () => this.evacuee.celebrate());
  }

  // ---- Building the world -------------------------------------------------------------

  private clearWorld(): void {
    this.world.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material === this.hitMaterial) continue;
          if (object.userData.ownsTexture) (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      } else if (object instanceof THREE.Sprite) {
        if (object.userData.ownsTexture) object.material.map?.dispose();
        object.material.dispose();
      }
    });
    this.scene.remove(this.world);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.nodes.clear();
    this.edges.clear();
    this.pickables = [];
    this.routeRibbon = null;
    this.drillRibbon = null;
    this.routeKey = '';
    this.drillKey = '';
    this.flowTextures = [];
    this.prevNodeState.clear();
    this.prevEdgeState.clear();
    this.evacueeAt = null;
    this.pops.clear();
  }

  private build(building: Building): void {
    this.clearWorld();
    this.building = building;
    const { nodes, edges } = building;

    // Map dataset coordinates to world units: x -> X, y -> Z (so the layout matches the 2D map).
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dataSpan = Math.max(maxX - minX, maxY - minY, 1);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let shortest = Infinity;
    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (a && b) {
        const length = Math.hypot(a.x - b.x, a.y - b.y);
        if (length > 0) shortest = Math.min(shortest, length);
      }
    }
    if (!Number.isFinite(shortest)) shortest = dataSpan;
    const k = Math.min(SHORTEST_CORRIDOR / shortest, MAX_SPAN / dataSpan);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const toWorld = (n: BuildingNode) => new THREE.Vector3((n.x - cx) * k, 0, (n.y - cy) * k);
    this.span = Math.max((maxX - minX) * k, (maxY - minY) * k, 8);
    this.extent.set(Math.max((maxX - minX) * k, 4), Math.max((maxY - minY) * k, 4));
    this.nodeScale = THREE.MathUtils.clamp((shortest * k) / (NODE_SIZE * 2.6), 0.3, 1);
    const u = this.nodeScale;

    // Ground with tile texture, sized to the building.
    const groundSize = this.span + 40;
    const floorTexture = this.kit.floor;
    floorTexture.repeat.set(groundSize / 5, groundSize / 5);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundSize, groundSize),
      standard(0xffffff, { map: floorTexture, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.world.add(ground);

    // Which wall sides need a doorway: one per direction a corridor leaves the room.
    const doors = new Map<string, Set<Side>>(nodes.map((n) => [n.id, new Set<Side>()]));
    const firstHeading = new Map<string, number>();
    for (const edge of edges) {
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (!a || !b) continue;
      for (const [self, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const dx = other.x - self.x;
        const dy = other.y - self.y;
        const side: Side =
          Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'south' : 'north';
        doors.get(self.id)?.add(side);
        if (!firstHeading.has(self.id)) firstHeading.set(self.id, -Math.atan2(dy, dx));
      }
    }

    for (const node of nodes) {
      const position = toWorld(node);
      const group = new THREE.Group();
      group.position.copy(position);
      group.scale.setScalar(u);
      const baseColor =
        node.type === 'room'
          ? COLORS.roomFloor
          : node.type === 'junction'
            ? COLORS.junction
            : COLORS.exitPad;
      const floor = standard(baseColor);
      let fire: THREE.Group | null = null;
      let exit: ExitParts | null = null;

      if (node.type === 'exit') {
        exit = buildExit(floor, this.kit, firstHeading.get(node.id) ?? 0);
        group.add(exit.group);
      } else {
        group.add(
          node.type === 'room'
            ? buildRoom(floor, doors.get(node.id) ?? new Set())
            : buildJunction(floor),
        );
        fire = buildFire();
        fire.visible = false;
        group.add(fire);
      }

      const accent =
        node.type === 'room' ? '#818cf8' : node.type === 'junction' ? '#94a3b8' : '#22c55e';
      const tag = nameTag(node.id, node.label, accent);
      tag.userData.ownsTexture = true;
      tag.position.y = node.type === 'exit' ? 3.95 : 3.0;
      group.add(tag);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(NODE_SIZE * 0.62, NODE_SIZE * 0.62, 3.4, 16),
        this.hitMaterial,
      );
      hit.position.y = 1.7;
      hit.userData = { kind: 'node', id: node.id };
      group.add(hit);
      this.pickables.push(hit);

      this.world.add(group);
      this.nodes.set(node.id, { node, group, position, floor, baseColor, fire, exit });
    }

    for (const edge of edges) {
      const a = this.nodes.get(edge.from)?.position;
      const b = this.nodes.get(edge.to)?.position;
      if (!a || !b) continue;
      const length = a.distanceTo(b);
      const angle = Math.atan2(b.z - a.z, b.x - a.x);
      const middle = a.clone().add(b).multiplyScalar(0.5);

      // Transparent from the start: toggling `transparent` later needs a shader rebuild.
      const material = standard(COLORS.corridor, { roughness: 0.9, transparent: true });
      const walkway = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.95 * u), material);
      walkway.position.set(middle.x, 0.05, middle.z);
      walkway.rotation.y = -angle;
      walkway.receiveShadow = true;
      this.world.add(walkway);

      const barrier = buildBarrier(this.kit);
      barrier.position.copy(middle);
      barrier.rotation.y = -angle;
      barrier.scale.setScalar(u);
      barrier.visible = false;
      this.world.add(barrier);

      const tag = costTag(this.kit.cost(edge.cost, 'normal'));
      tag.position.set(middle.x, 1.55 * u, middle.z);
      tag.scale.multiplyScalar(Math.max(u, 0.6));
      this.world.add(tag);

      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(length - NODE_SIZE * u * 1.25, 0.6), 1.2, 1.8 * u),
        this.hitMaterial,
      );
      hit.position.set(middle.x, 0.6, middle.z);
      hit.rotation.y = -angle;
      hit.userData = { kind: 'edge', id: edge.id };
      this.world.add(hit);
      this.pickables.push(hit);

      this.edges.set(edge.id, { cost: edge.cost, material, barrier, tag });
    }

    for (const object of [this.startRing, this.beacon, this.hoverRing, this.evacuee.group]) {
      object.scale.setScalar(u);
    }
    const reach = this.span / 2 + 10;
    Object.assign(this.sun.shadow.camera, {
      left: -reach,
      right: reach,
      top: reach,
      bottom: -reach,
      far: reach * 6,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(reach * 0.5, reach * 1.6, reach * 0.9);
    this.resetCamera();
  }

  /** Flat arrow ribbon along a path, raised slightly above the corridors. */
  private ribbon(path: string[], color: number, flow: boolean): THREE.Group {
    const group = new THREE.Group();
    const width = 0.78 * this.nodeScale;
    const lift = flow ? 0.2 : 0.24;
    const points = path.map((id) => this.nodes.get(id)?.position).filter((p) => p !== undefined);
    const jointMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i] as THREE.Vector3;
      const b = points[i + 1] as THREE.Vector3;
      const length = a.distanceTo(b);
      const texture = this.kit.chevron.clone();
      texture.repeat.set(length / (1.1 * this.nodeScale + 0.4), 1);
      if (flow) this.flowTextures.push(texture);
      const segment = new THREE.Mesh(
        new THREE.PlaneGeometry(length, width),
        new THREE.MeshBasicMaterial({
          color,
          map: texture,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      segment.userData.ownsTexture = true;
      segment.position.set((a.x + b.x) / 2, lift, (a.z + b.z) / 2);
      segment.rotation.set(-Math.PI / 2, -Math.atan2(b.z - a.z, b.x - a.x), 0, 'YXZ');
      group.add(segment);
      const joint = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 20), jointMaterial);
      joint.rotation.x = -Math.PI / 2;
      joint.position.set(b.x, lift - 0.005, b.z);
      group.add(joint);
    }
    this.world.add(group);
    return group;
  }

  private removeRibbon(ribbon: THREE.Group | null): void {
    if (!ribbon) return;
    ribbon.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const material = object.material as THREE.MeshBasicMaterial;
        if (object.userData.ownsTexture) {
          this.flowTextures = this.flowTextures.filter((t) => t !== material.map);
          material.map?.dispose();
        }
        material.dispose();
      }
    });
    this.world.remove(ribbon);
  }

  // ---- Updating from app state ----------------------------------------------------------

  update(state: AppState, route: RouteResult, event: AppEvent): void {
    if (!state.building) return;
    if (state.building !== this.building) this.build(state.building);

    const { hazards, drill } = state;
    this.mode = state.mode;
    this.drillActive = drill !== null && !drill.escaped;
    const animate = event.type !== 'ui' && event.type !== 'load' && event.type !== 'init';
    const showRoute = route.status === 'ok' && !this.drillActive;
    const routeEdges = new Set(showRoute && route.status === 'ok' ? route.edgeIds : []);

    for (const [id, view] of this.nodes) {
      const blocked = hazards.blockedNodes.has(id);
      const closed = hazards.closedExits.has(id);
      const key = blocked ? 'blocked' : closed ? 'closed' : 'open';
      view.floor.color.setHex(blocked ? COLORS.hazardFloor : closed ? 0x334155 : view.baseColor);
      if (view.fire) view.fire.visible = blocked;
      if (view.exit) {
        view.exit.shutter.visible = closed;
        view.exit.sign.material.map = closed ? this.kit.exitClosed : this.kit.exitOpen;
      }
      if (animate && this.prevNodeState.has(id) && this.prevNodeState.get(id) !== key)
        this.pop(view.group);
      this.prevNodeState.set(id, key);
    }

    for (const [id, view] of this.edges) {
      const edge = state.graph?.edges.get(id);
      if (!edge) continue;
      const blocked = hazards.blockedEdges.has(id);
      const unusable =
        !blocked &&
        [edge.from, edge.to].some(
          (end) => hazards.blockedNodes.has(end) || hazards.closedExits.has(end),
        );
      view.material.color.setHex(
        blocked ? COLORS.corridorBlocked : unusable ? COLORS.corridorUnusable : COLORS.corridor,
      );
      view.material.opacity = unusable ? 0.4 : 1;
      view.barrier.visible = blocked;
      view.tag.material.map = this.kit.cost(
        view.cost,
        blocked ? 'blocked' : routeEdges.has(id) ? 'route' : 'normal',
      );
      view.tag.material.opacity = unusable ? 0.5 : 1;
      const key = blocked ? 'blocked' : 'open';
      if (animate && this.prevEdgeState.has(id) && this.prevEdgeState.get(id) !== key)
        this.pop(view.barrier);
      this.prevEdgeState.set(id, key);
    }

    // Start ring and the destination beacon.
    const start = state.start ? this.nodes.get(state.start) : undefined;
    this.startRing.visible = start !== undefined;
    if (start) this.startRing.position.set(start.position.x, 0.24, start.position.z);
    const destination =
      showRoute && route.status === 'ok' ? this.nodes.get(route.exitId) : undefined;
    this.beacon.visible = destination !== undefined;
    if (destination)
      this.beacon.position.set(
        destination.position.x,
        3.5 * this.nodeScale,
        destination.position.z,
      );

    // Route ribbons: blue flowing arrows for the computed route, orange for the player's drill path.
    const routeKey = showRoute && route.status === 'ok' ? route.path.join('\u0000') : '';
    if (routeKey !== this.routeKey) {
      this.removeRibbon(this.routeRibbon);
      this.routeRibbon =
        routeKey && route.status === 'ok' ? this.ribbon(route.path, COLORS.route, true) : null;
      this.routeKey = routeKey;
    }
    const drillKey = drill && drill.path.length > 1 ? drill.path.join('\u0000') : '';
    if (drillKey !== this.drillKey) {
      this.removeRibbon(this.drillRibbon);
      this.drillRibbon = drillKey && drill ? this.ribbon(drill.path, COLORS.drill, false) : null;
      this.drillKey = drillKey;
    }

    this.updateEvacuee(state, event);
  }

  private updateEvacuee(state: AppState, event: AppEvent): void {
    const { drill } = state;
    const target = drill ? (drill.path[drill.path.length - 1] ?? null) : state.start;
    const reduce = this.reducedMotion.matches;

    if (!target) {
      this.evacuee.hide();
      this.evacueeAt = null;
      return;
    }
    const to = this.nodes.get(target)?.position;
    if (!to) return;

    const moved = target !== this.evacueeAt;
    const interrupted = this.evacueeDisplaced && event.type !== 'ui';
    if (!moved && !interrupted) return;
    this.evacueeDisplaced = false;

    const from = this.evacueeAt ? this.nodes.get(this.evacueeAt)?.position : undefined;
    const stepped = event.type === 'drill' && event.step === 'move' && from !== undefined;
    if (stepped) {
      this.evacuee.walkAlong([from, to], reduce, () => {
        if (drill?.escaped) this.evacuee.celebrate();
      });
    } else {
      this.evacuee.placeAt(to);
      if (event.type === 'start' || (event.type === 'drill' && event.step === 'start'))
        this.pop(this.evacuee.group);
    }
    this.evacueeAt = target;
  }

  private pop(object: THREE.Object3D): void {
    if (this.reducedMotion.matches) return;
    const existing = this.pops.get(object);
    this.pops.set(object, { t: 0, base: existing?.base ?? object.scale.x });
  }

  // ---- Interaction -------------------------------------------------------------------

  private pick(event: PointerEvent): { kind: 'node' | 'edge'; id: string } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    // Prefer a location over a corridor when both are under the pointer.
    const node = hits.find((h) => h.object.userData.kind === 'node');
    const chosen = node ?? hits[0];
    if (!chosen) return null;
    return { kind: chosen.object.userData.kind, id: chosen.object.userData.id };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.downAt = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.downAt;
    this.downAt = null;
    if (!down || event.button !== 0) return;
    // A drag rotates the camera; only a near-stationary press counts as a click.
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) return;
    const target = this.pick(event);
    if (!target) return;
    if (target.kind === 'node') this.handlers.onNode(target.id);
    else this.handlers.onEdge(target.id);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.buttons !== 0) return;
    const target = this.pick(event);
    const actionable =
      target !== null && (target.kind === 'node' || (this.mode === 'hazard' && !this.drillActive));
    this.renderer.domElement.style.cursor = actionable ? 'pointer' : 'grab';
    const hovered = target?.kind === 'node' ? this.nodes.get(target.id) : undefined;
    this.hoverRing.visible = hovered !== undefined;
    if (hovered) this.hoverRing.position.set(hovered.position.x, 0.22, hovered.position.z);
  };

  private readonly onPointerLeave = (): void => {
    this.hoverRing.visible = false;
  };

  // ---- Frame loop --------------------------------------------------------------------

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height);
    const previous = this.camera.aspect;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Re-frame when the view changes shape (rotation, window resize), not on every pixel.
    if (this.building && Math.abs(previous - this.camera.aspect) / previous > 0.15)
      this.resetCamera();
  }

  private readonly tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const reduce = this.reducedMotion.matches;
    this.time += dt;
    this.controls.update();

    if (!reduce) {
      // Gentle, slow motion only: no flashing lights or rapid brightness changes.
      for (const view of this.nodes.values()) {
        if (!view.fire?.visible) continue;
        for (const flame of view.fire.children) {
          const phase = flame.userData.phase as number;
          flame.scale.y = 1 + 0.16 * Math.sin(this.time * 5 + phase);
          flame.scale.x = flame.scale.z = 1 + 0.06 * Math.sin(this.time * 7 + phase);
        }
      }
      this.startRing.rotation.z += dt * 0.8;
      this.beacon.material.opacity = 0.18 + 0.06 * Math.sin(this.time * 2);
      for (const texture of this.flowTextures) texture.offset.x -= dt * 0.9;
    }

    for (const [object, pop] of this.pops) {
      pop.t += dt;
      const progress = Math.min(pop.t / POP_SECONDS, 1);
      object.scale.setScalar(pop.base * (1 + 0.16 * Math.sin(Math.PI * progress)));
      if (progress >= 1) {
        object.scale.setScalar(pop.base);
        this.pops.delete(object);
      }
    }

    this.evacuee.update(dt, reduce);
    this.renderer.render(this.scene, this.camera);
  };
}
