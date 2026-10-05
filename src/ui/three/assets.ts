import * as THREE from 'three';

/**
 * Procedural assets: every texture is drawn on a canvas and every model is built from simple
 * geometry, so the 3D view needs no downloaded model files (nothing to license or host).
 */

export const COLORS = {
  background: 0x0b1220,
  ground: 0x1b2537,
  roomFloor: 0x312e81,
  roomWall: 0x818cf8,
  junction: 0x475569,
  exitPad: 0x166534,
  exitFrame: 0xe2e8f0,
  corridor: 0x64748b,
  corridorBlocked: 0x7f1d1d,
  corridorUnusable: 0x1e293b,
  hazardFloor: 0x7f1d1d,
  route: 0x3b82f6,
  drill: 0xf97316,
  start: 0xf59e0b,
  beacon: 0x22c55e,
  hover: 0xffffff,
  wood: 0x9a6a3a,
  metal: 0x334155,
} as const;

const FONT = `'Inter Variable', 'Noto Sans Bengali Variable', system-ui, sans-serif`;

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Textures shared by many meshes. Created once per scene and disposed with it. */
export class TextureKit {
  readonly floor = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#1b2537';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 3;
    for (const p of [0, 128]) {
      ctx.strokeRect(p + 1.5, 1.5, 125, 253);
      ctx.strokeRect(1.5, p + 1.5, 253, 125);
    }
  });

  /** Red/white hazard stripes for barriers and shutters. */
  readonly stripes = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#dc2626';
    for (let i = -128; i < 256; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 24, 0);
      ctx.lineTo(i + 24 + 128, 128);
      ctx.lineTo(i + 128, 128);
      ctx.fill();
    }
  });

  /** White chevrons pointing along +u; tinted by the material colour and scrolled to show flow. */
  readonly chevron = canvasTexture(128, 64, (ctx) => {
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(34, 8);
    ctx.lineTo(70, 32);
    ctx.lineTo(34, 56);
    ctx.lineTo(54, 56);
    ctx.lineTo(90, 32);
    ctx.lineTo(54, 8);
    ctx.closePath();
    ctx.fill();
  });

  readonly exitOpen = signTexture('EXIT', '#15803d', '#ffffff');
  readonly exitClosed = signTexture('CLOSED', '#b91c1c', '#ffffff');

  private readonly costCache = new Map<string, THREE.Texture>();

  constructor() {
    this.floor.wrapS = this.floor.wrapT = THREE.RepeatWrapping;
    this.stripes.wrapS = this.stripes.wrapT = THREE.RepeatWrapping;
    this.chevron.wrapS = THREE.RepeatWrapping;
  }

  /** Pill showing a corridor cost; cached by value and variant. */
  cost(value: number, variant: 'normal' | 'blocked' | 'route'): THREE.Texture {
    const key = `${value}|${variant}`;
    let texture = this.costCache.get(key);
    if (!texture) {
      const bg = variant === 'blocked' ? '#b91c1c' : variant === 'route' ? '#2563eb' : '#0f172a';
      const border = variant === 'normal' ? '#94a3b8' : '#ffffff';
      texture = canvasTexture(128, 80, (ctx) => {
        roundRect(ctx, 6, 6, 116, 68, 34);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = border;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 44px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(value), 64, 42);
        if (variant === 'blocked') {
          ctx.fillRect(34, 40, 60, 5);
        }
      });
      this.costCache.set(key, texture);
    }
    return texture;
  }

  dispose(): void {
    for (const texture of [
      this.floor,
      this.stripes,
      this.chevron,
      this.exitOpen,
      this.exitClosed,
    ]) {
      texture.dispose();
    }
    for (const texture of this.costCache.values()) texture.dispose();
    this.costCache.clear();
  }
}

function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  return canvasTexture(256, 96, (ctx) => {
    roundRect(ctx, 4, 4, 248, 88, 14);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = `900 52px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 52);
  });
}

/** Floating name tag (id in bold, label below). Always drawn on top so it stays readable. */
export function nameTag(id: string, label: string, accent: string): THREE.Sprite {
  const texture = canvasTexture(512, 176, (ctx) => {
    roundRect(ctx, 8, 8, 496, 160, 28);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText(id, 256, 62, 470);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(label, 256, 124, 470);
  });
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.scale.set(3.8, 1.3, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function costTag(texture: THREE.Texture): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    }),
  );
  sprite.scale.set(1.5, 0.94, 1);
  sprite.renderOrder = 15;
  return sprite;
}

export function standard(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Canonical node footprint; node groups are scaled to fit each dataset. */
export const NODE_SIZE = 2.6;
const HALF = NODE_SIZE / 2;
const DOOR = 1.05;

export type Side = 'east' | 'west' | 'north' | 'south';

/** Room: floor slab, walls with a doorway on every side a corridor leaves from, and furniture. */
export function buildRoom(floor: THREE.MeshStandardMaterial, doors: Set<Side>): THREE.Group {
  const group = new THREE.Group();
  const slab = box(NODE_SIZE, 0.16, NODE_SIZE, floor, 0, 0.08, 0);
  slab.castShadow = false;
  group.add(slab);

  const wall = standard(COLORS.roomWall, { roughness: 0.6 });
  const height = 1.15;
  const thick = 0.14;
  const y = 0.16 + height / 2;
  const sideLength = NODE_SIZE;
  const piece = (sideLength - DOOR) / 2;

  const sides: { side: Side; horizontal: boolean; offset: number }[] = [
    { side: 'north', horizontal: true, offset: -HALF + thick / 2 },
    { side: 'south', horizontal: true, offset: HALF - thick / 2 },
    { side: 'west', horizontal: false, offset: -HALF + thick / 2 },
    { side: 'east', horizontal: false, offset: HALF - thick / 2 },
  ];
  for (const { side, horizontal, offset } of sides) {
    const segments = doors.has(side)
      ? [
          { length: piece, center: -HALF + piece / 2 },
          { length: piece, center: HALF - piece / 2 },
        ]
      : [{ length: sideLength, center: 0 }];
    for (const { length, center } of segments) {
      group.add(
        horizontal
          ? box(length, height, thick, wall, center, y, offset)
          : box(thick, height, length, wall, offset, y, center),
      );
    }
  }

  // Furniture placed in the corners, away from the doorways' centre lines.
  const wood = standard(COLORS.wood);
  group.add(box(0.8, 0.42, 0.45, wood, -0.68, 0.37, -0.68));
  group.add(box(0.36, 0.7, 0.36, standard(COLORS.metal), 0.72, 0.51, 0.72));
  return group;
}

/** Junction: round floor plate with a small lamp post. */
export function buildJunction(floor: THREE.MeshStandardMaterial): THREE.Group {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.1, 0.14, 40), floor);
  plate.position.y = 0.07;
  plate.receiveShadow = true;
  group.add(plate);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 1.7, 12),
    standard(COLORS.metal),
  );
  post.position.set(0.72, 0.99, -0.72);
  post.castShadow = true;
  group.add(post);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd27a, emissiveIntensity: 1.2 }),
  );
  bulb.position.set(0.72, 1.88, -0.72);
  group.add(bulb);
  return group;
}

export interface ExitParts {
  group: THREE.Group;
  sign: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  shutter: THREE.Mesh;
}

/** Exit: green pad, door frame facing the incoming corridor, EXIT sign and a roll-down shutter. */
export function buildExit(
  floor: THREE.MeshStandardMaterial,
  kit: TextureKit,
  facing: number,
): ExitParts {
  const group = new THREE.Group();
  const pad = box(NODE_SIZE, 0.16, NODE_SIZE, floor, 0, 0.08, 0);
  pad.castShadow = false;
  group.add(pad);

  const frame = new THREE.Group();
  frame.rotation.y = facing;
  const metal = standard(COLORS.exitFrame, { roughness: 0.4, metalness: 0.3 });
  frame.add(box(0.18, 2.2, 0.18, metal, 0, 1.26, -0.82));
  frame.add(box(0.18, 2.2, 0.18, metal, 0, 1.26, 0.82));
  frame.add(box(0.18, 0.18, 1.82, metal, 0, 2.36, 0));

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.6),
    new THREE.MeshBasicMaterial({ map: kit.exitOpen, side: THREE.DoubleSide, toneMapped: false }),
  );
  sign.position.set(0, 2.82, 0);
  sign.rotation.y = Math.PI / 2;
  frame.add(sign);

  const shutterMaterial = standard(0xffffff, { map: kit.stripes, roughness: 0.5 });
  const shutter = box(0.08, 2.0, 1.48, shutterMaterial, 0, 1.17, 0);
  shutter.visible = false;
  frame.add(shutter);

  group.add(frame);
  return { group, sign, shutter };
}

/** Animated fire marking a blocked room or junction. */
export function buildFire(): THREE.Group {
  const group = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const inner = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flames: [number, number, number, number][] = [
    [0, 0, 1.35, 0.42],
    [0.45, 0.25, 1.0, 0.32],
    [-0.42, 0.3, 0.95, 0.3],
    [0.1, -0.45, 0.85, 0.28],
  ];
  flames.forEach(([x, z, height, radius], i) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 14, 1, true), outer);
    flame.position.set(x, 0.16 + height / 2, z);
    flame.userData.phase = i * 1.7;
    flame.userData.baseHeight = height;
    group.add(flame);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.5, height * 0.6, 10, 1, true),
      inner,
    );
    core.position.set(x, 0.16 + height * 0.3, z);
    core.userData.phase = i * 1.7 + 0.8;
    group.add(core);
  });
  return group;
}

/** Striped barrier across a blocked corridor (local x runs along the corridor). */
export function buildBarrier(kit: TextureKit): THREE.Group {
  const group = new THREE.Group();
  const post = standard(COLORS.metal);
  const stripes = standard(0xffffff, { map: kit.stripes, roughness: 0.5 });
  group.add(box(0.12, 0.95, 0.12, post, 0, 0.47, -0.62));
  group.add(box(0.12, 0.95, 0.12, post, 0, 0.47, 0.62));
  group.add(box(0.1, 0.2, 1.42, stripes, 0, 0.8, 0));
  group.add(box(0.1, 0.2, 1.42, stripes, 0, 0.45, 0));
  return group;
}
