import * as THREE from 'three';
import { standard } from './assets';

const WALK_SPEED = 9; // world units per second: brief, never holds up the controls
const STEP_RATE = 11;

interface Walk {
  points: THREE.Vector3[];
  segment: number;
  progress: number;
  onDone?: () => void;
}

/** A stylised person in a hi-vis vest and hard hat that can walk along a polyline. */
export class Evacuee {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly arms: THREE.Mesh[] = [];
  private walk: Walk | null = null;
  private time = 0;
  private hop = 0;

  constructor() {
    const vest = standard(0xf97316, { roughness: 0.5 });
    const dark = standard(0x1e293b);
    const skin = standard(0xd6a27a);
    const helmet = standard(0xfacc15, { roughness: 0.35 });
    const reflective = standard(0xe2e8f0, { roughness: 0.2, metalness: 0.6 });

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), dark);
      leg.geometry.translate(0, -0.3, 0); // pivot at the hip
      leg.position.set(0.13 * side, 0.62, 0);
      this.legs.push(leg);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.38, 4, 8), vest);
      arm.geometry.translate(0, -0.24, 0); // pivot at the shoulder
      arm.position.set(0.33 * side, 1.22, 0);
      this.arms.push(arm);
    }
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.42, 6, 12), vest);
    torso.position.y = 1.02;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 20), reflective);
    stripe.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin);
    head.position.y = 1.55;
    const hat = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      helmet,
    );
    hat.position.y = 1.6;

    this.body.add(torso, stripe, head, hat, ...this.legs, ...this.arms);
    this.body.traverse((object) => {
      object.castShadow = true;
    });
    this.group.add(this.body);
    this.group.visible = false;
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  placeAt(point: THREE.Vector3): void {
    this.walk = null;
    this.group.position.copy(point);
    this.group.visible = true;
  }

  hide(): void {
    this.walk = null;
    this.group.visible = false;
  }

  /** Walks through `points` (the first point is where it starts). Instant when motion is reduced. */
  walkAlong(points: THREE.Vector3[], reduceMotion: boolean, onDone?: () => void): void {
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return;
    this.group.visible = true;
    if (reduceMotion || points.length < 2) {
      this.placeAt(last);
      onDone?.();
      return;
    }
    this.group.position.copy(first);
    this.walk = { points, segment: 0, progress: 0, onDone };
  }

  /** A small celebratory jump (used when an exit is reached). */
  celebrate(): void {
    this.hop = 1;
  }

  update(dt: number, reduceMotion: boolean): void {
    this.time += dt;
    const walk = this.walk;
    let stride = 0;

    if (walk) {
      let remaining = WALK_SPEED * dt;
      while (remaining > 0 && this.walk) {
        const from = walk.points[walk.segment] as THREE.Vector3;
        const to = walk.points[walk.segment + 1];
        if (!to) {
          this.walk = null;
          walk.onDone?.();
          break;
        }
        const length = from.distanceTo(to);
        const left = length * (1 - walk.progress);
        if (remaining >= left) {
          remaining -= left;
          walk.segment += 1;
          walk.progress = 0;
          this.group.position.copy(to);
        } else {
          walk.progress += remaining / Math.max(length, 1e-6);
          remaining = 0;
          this.group.position.lerpVectors(from, to, walk.progress);
          this.group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        }
      }
      stride = Math.sin(this.time * STEP_RATE) * 0.6;
    }

    this.legs.forEach((leg, i) => (leg.rotation.x = i === 0 ? stride : -stride));
    this.arms.forEach((arm, i) => (arm.rotation.x = i === 0 ? -stride : stride));

    let lift = 0;
    if (this.hop > 0) {
      this.hop = Math.max(0, this.hop - dt * 2.4);
      lift = Math.sin(this.hop * Math.PI) * 0.6;
    } else if (!walk && !reduceMotion) {
      lift = Math.sin(this.time * 2.2) * 0.03; // idle breathing
    }
    this.body.position.y = lift;
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }
}
