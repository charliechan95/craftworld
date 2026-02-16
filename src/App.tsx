import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import SplashScreen from './SplashScreen';

// ============================================================
// TYPES
// ============================================================
type BlockType = 'grass' | 'dirt' | 'stone' | 'wood' | 'leaves' | 'sand' | 'glass' | 'water' | 'bedrock';

interface WorldData {
  blocks: Map<string, BlockType>;
  heightMap: Map<string, number>;
}

type TimeOfDay = 'dawn' | 'morning' | 'day' | 'afternoon' | 'sunset' | 'dusk' | 'night' | 'late_night';

// ============================================================
// CONSTANTS
// ============================================================
const WORLD_SIZE = 64;
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const GRAVITY = 28;
const JUMP_FORCE = 9;
const WALK_SPEED = 6;
const FLY_SPEED = 16;
const SPRINT_MULTIPLIER = 1.6;
const REACH_DISTANCE = 6;

// Full day cycle in seconds (real time). 1 Minecraft day = 10 minutes real time
const DAY_CYCLE_DURATION = 600;

const BLOCK_COLORS: Record<BlockType, string> = {
  grass: '#5d9e3c',
  dirt: '#8b6b3d',
  stone: '#888888',
  wood: '#6b4226',
  leaves: '#2d8a2d',
  sand: '#d4c478',
  glass: '#c8e8f0',
  water: '#3578c4',
  bedrock: '#444444',
};

const BLOCK_NAMES: Record<BlockType, string> = {
  grass: 'Grass',
  dirt: 'Dirt',
  stone: 'Stone',
  wood: 'Wood',
  leaves: 'Leaves',
  sand: 'Sand',
  glass: 'Glass',
  water: 'Water',
  bedrock: 'Bedrock',
};

const HOTBAR_BLOCKS: BlockType[] = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand', 'glass', 'water', 'bedrock'];

// ============================================================
// DAY/NIGHT CYCLE SYSTEM
// ============================================================
interface DayNightState {
  timeOfDay: TimeOfDay;
  timeLabel: string;
  sunPosition: [number, number, number];
  moonPosition: [number, number, number];
  skyTopColor: THREE.Color;
  skyBottomColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  sunIntensity: number;
  sunColor: THREE.Color;
  starsOpacity: number;
  progress: number;
  gameHour: number;
  dayFactor: number;
}

function getDayNightState(timeSeconds: number): DayNightState {
  const progress = (timeSeconds % DAY_CYCLE_DURATION) / DAY_CYCLE_DURATION;
  const gameHour = progress * 24;

  const sunAngle = progress * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const sunHorizontal = Math.cos(sunAngle);

  const sunPosition: [number, number, number] = [
    sunHorizontal * 120,
    sunHeight * 120,
    -30
  ];

  const moonPosition: [number, number, number] = [
    -sunHorizontal * 120,
    -sunHeight * 120,
    30
  ];

  let timeOfDay: TimeOfDay;
  let timeLabel: string;

  if (gameHour >= 5 && gameHour < 6.5) {
    timeOfDay = 'dawn';
    timeLabel = 'Dawn';
  } else if (gameHour >= 6.5 && gameHour < 9) {
    timeOfDay = 'morning';
    timeLabel = 'Morning';
  } else if (gameHour >= 9 && gameHour < 15) {
    timeOfDay = 'day';
    timeLabel = 'Day';
  } else if (gameHour >= 15 && gameHour < 17) {
    timeOfDay = 'afternoon';
    timeLabel = 'Afternoon';
  } else if (gameHour >= 17 && gameHour < 19) {
    timeOfDay = 'sunset';
    timeLabel = 'Sunset';
  } else if (gameHour >= 19 && gameHour < 20.5) {
    timeOfDay = 'dusk';
    timeLabel = 'Dusk';
  } else if (gameHour >= 20.5 || gameHour < 3) {
    timeOfDay = 'night';
    timeLabel = 'Night';
  } else {
    timeOfDay = 'late_night';
    timeLabel = 'Late Night';
  }

  const dayFactor = Math.max(0, Math.min(1, (sunHeight + 0.15) / 0.65));

  const nightTopColor = new THREE.Color('#0a0a2e');
  const nightBottomColor = new THREE.Color('#1a1a3e');
  const dayTopColor = new THREE.Color('#4a90d9');
  const dayBottomColor = new THREE.Color('#87CEEB');

  const sunsetTopColor = new THREE.Color('#c85a2e');
  const sunsetBottomColor = new THREE.Color('#e8a040');

  const horizonFactor = Math.max(0, 1 - Math.abs(sunHeight) * 5) * (sunHeight > -0.1 ? 1 : 0);

  const skyTopColor = new THREE.Color().copy(nightTopColor).lerp(dayTopColor, dayFactor);
  const skyBottomColor = new THREE.Color().copy(nightBottomColor).lerp(dayBottomColor, dayFactor);

  if (horizonFactor > 0) {
    skyTopColor.lerp(sunsetTopColor, horizonFactor * 0.6);
    skyBottomColor.lerp(sunsetBottomColor, horizonFactor * 0.8);
  }

  const fogColor = skyBottomColor.clone();
  const fogNear = THREE.MathUtils.lerp(30, 60, dayFactor);
  const fogFar = THREE.MathUtils.lerp(80, 160, dayFactor);

  const ambientIntensity = THREE.MathUtils.lerp(0.08, 0.5, dayFactor);
  const sunIntensity = THREE.MathUtils.lerp(0.0, 1.3, dayFactor);

  const sunColor = new THREE.Color('#ffffff');
  if (horizonFactor > 0) {
    sunColor.lerp(new THREE.Color('#ff8844'), horizonFactor);
  }

  const starsOpacity = Math.max(0, 1 - dayFactor * 2);

  return {
    timeOfDay,
    timeLabel,
    sunPosition,
    moonPosition,
    skyTopColor,
    skyBottomColor,
    fogColor,
    fogNear,
    fogFar,
    ambientIntensity,
    sunIntensity,
    sunColor,
    starsOpacity,
    progress,
    gameHour,
    dayFactor,
  };
}

function formatGameTime(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// ============================================================
// WORLD GENERATION
// ============================================================
const noise2D = createNoise2D(() => 0.42);
const noise2D_b = createNoise2D(() => 0.73);
const noise2D_c = createNoise2D(() => 0.15);

function fbm(x: number, z: number, octaves: number, lacunarity: number, gain: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2D(x * freq, z * freq) * amp;
    maxAmp += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / maxAmp;
}

function getTerrainHeight(x: number, z: number): number {
  const scale = 0.015;
  const h = fbm(x * scale, z * scale, 4, 2.0, 0.5);
  const mountains = Math.max(0, fbm(x * scale * 0.5 + 100, z * scale * 0.5 + 100, 3, 2.0, 0.6)) * 8;
  return Math.floor(h * 6 + 8 + mountains);
}

function getBiome(x: number, z: number): 'forest' | 'plains' | 'desert' {
  const val = noise2D_b(x * 0.008 + 500, z * 0.008 + 500);
  if (val < -0.25) return 'desert';
  if (val > 0.2) return 'forest';
  return 'plains';
}

function shouldPlaceTree(x: number, z: number, biome: string): boolean {
  const treeNoise = noise2D_c(x * 0.5 + 1000, z * 0.5 + 1000);
  if (biome === 'forest') return treeNoise > 0.7;
  if (biome === 'plains') return treeNoise > 0.88;
  return false;
}

function generateWorld(): WorldData {
  const blocks = new Map<string, BlockType>();
  const heightMap = new Map<string, number>();
  const treePositions: { x: number; z: number; h: number }[] = [];

  for (let x = -WORLD_SIZE; x < WORLD_SIZE; x++) {
    for (let z = -WORLD_SIZE; z < WORLD_SIZE; z++) {
      const height = getTerrainHeight(x, z);
      const biome = getBiome(x, z);
      heightMap.set(`${x},${z}`, height);

      blocks.set(`${x},0,${z}`, 'bedrock');

      for (let y = 1; y <= height; y++) {
        let type: BlockType;
        if (y === height) {
          type = biome === 'desert' ? 'sand' : 'grass';
        } else if (y > height - 3) {
          type = biome === 'desert' ? 'sand' : 'dirt';
        } else {
          type = 'stone';
        }
        blocks.set(`${x},${y},${z}`, type);
      }

      if (height < 5) {
        for (let y = height + 1; y <= 5; y++) {
          blocks.set(`${x},${y},${z}`, 'water');
        }
        heightMap.set(`${x},${z}`, 5);
      }

      if (height >= 5 && biome !== 'desert' && shouldPlaceTree(x, z, biome)) {
        treePositions.push({ x, z, h: height });
      }
    }
  }

  for (const tree of treePositions) {
    const trunkHeight = 4 + Math.floor(Math.abs(noise2D_c(tree.x * 7.3, tree.z * 7.3)) * 3);
    const baseY = tree.h + 1;

    for (let y = 0; y < trunkHeight; y++) {
      blocks.set(`${tree.x},${baseY + y},${tree.z}`, 'wood');
    }

    const leafCenter = baseY + trunkHeight - 1;
    const leafRadius = 2;
    for (let lx = -leafRadius; lx <= leafRadius; lx++) {
      for (let ly = -1; ly <= leafRadius; ly++) {
        for (let lz = -leafRadius; lz <= leafRadius; lz++) {
          const dist = Math.sqrt(lx * lx + ly * ly + lz * lz);
          if (dist <= leafRadius + 0.5) {
            const key = `${tree.x + lx},${leafCenter + ly},${tree.z + lz}`;
            if (!blocks.has(key) || blocks.get(key) !== 'wood') {
              blocks.set(key, 'leaves');
            }
          }
        }
      }
    }
    blocks.set(`${tree.x},${leafCenter + leafRadius + 1},${tree.z}`, 'leaves');
  }

  return { blocks, heightMap };
}

// ============================================================
// HELPERS
// ============================================================
function toKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function fromKey(key: string): [number, number, number] {
  const parts = key.split(',');
  return [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2])];
}

// ============================================================
// FACE CULLING
// ============================================================
const FACE_DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

function hasExposedFace(blocks: Map<string, BlockType>, key: string): boolean {
  const [x, y, z] = fromKey(key);
  for (const [dx, dy, dz] of FACE_DIRS) {
    const neighborKey = toKey(x + dx, y + dy, z + dz);
    const neighbor = blocks.get(neighborKey);
    if (!neighbor || neighbor === 'glass' || neighbor === 'water' || neighbor === 'leaves') {
      return true;
    }
  }
  return false;
}

// ============================================================
// INSTANCED BLOCKS — with frustumCulled=false to prevent disappearing
// ============================================================
function ChunkMesh({ blocks }: { blocks: Map<string, BlockType> }) {
  const meshGroups = useMemo(() => {
    const groups: Record<string, THREE.Matrix4[]> = {};

    for (const [key, type] of blocks) {
      if (!hasExposedFace(blocks, key)) continue;

      if (!groups[type]) {
        groups[type] = [];
      }
      const [x, y, z] = fromKey(key);
      const mat = new THREE.Matrix4();
      mat.setPosition(x, y, z);
      groups[type].push(mat);
    }

    return groups;
  }, [blocks]);

  return (
    <>
      {Object.entries(meshGroups).map(([type, matrices]) => (
        <InstancedBlocks
          key={type}
          type={type as BlockType}
          matrices={matrices}
        />
      ))}
    </>
  );
}

function InstancedBlocks({ type, matrices }: { type: BlockType; matrices: THREE.Matrix4[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = matrices.length;

  useEffect(() => {
    if (!meshRef.current || count === 0) return;
    for (let i = 0; i < count; i++) {
      meshRef.current.setMatrixAt(i, matrices[i]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;

    // Manually compute a correct bounding sphere that encompasses all instances
    // This prevents Three.js from using a wrong bounding sphere that causes culling glitches
    const box = new THREE.Box3();
    const tempVec = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      tempVec.setFromMatrixPosition(matrices[i]);
      box.expandByPoint(tempVec);
    }
    // Expand by 1 in each direction to account for block size
    box.expandByScalar(1);
    meshRef.current.geometry.boundingSphere = new THREE.Sphere();
    box.getBoundingSphere(meshRef.current.geometry.boundingSphere);
    meshRef.current.geometry.boundingBox = box;
  }, [matrices, count]);

  if (count === 0) return null;

  const isTransparent = type === 'glass' || type === 'water' || type === 'leaves';
  const opacity = type === 'glass' ? 0.35 : type === 'water' ? 0.6 : type === 'leaves' ? 0.85 : 1;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial
        color={BLOCK_COLORS[type]}
        transparent={isTransparent}
        opacity={opacity}
        side={isTransparent ? THREE.DoubleSide : THREE.FrontSide}
        depthWrite={!isTransparent}
      />
    </instancedMesh>
  );
}

// ============================================================
// RAYCASTING
// ============================================================
function raycastBlocks(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  blocks: Map<string, BlockType>,
  maxDist: number
): { hitKey: string; hitPos: [number, number, number]; faceNormal: [number, number, number] } | null {
  const step = 0.05;
  const pos = origin.clone();
  const dir = direction.clone().normalize().multiplyScalar(step);
  let prevX = Math.round(pos.x);
  let prevY = Math.round(pos.y);
  let prevZ = Math.round(pos.z);

  for (let d = 0; d < maxDist; d += step) {
    pos.add(dir);
    const bx = Math.round(pos.x);
    const by = Math.round(pos.y);
    const bz = Math.round(pos.z);

    if (bx !== prevX || by !== prevY || bz !== prevZ) {
      const key = toKey(bx, by, bz);
      const blockType = blocks.get(key);
      if (blockType && blockType !== 'water') {
        const nx = bx - prevX;
        const ny = by - prevY;
        const nz = bz - prevZ;
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        let fnx = 0, fny = 0, fnz = 0;
        if (ax >= ay && ax >= az) fnx = -Math.sign(nx);
        else if (ay >= ax && ay >= az) fny = -Math.sign(ny);
        else fnz = -Math.sign(nz);

        return {
          hitKey: key,
          hitPos: [bx, by, bz],
          faceNormal: [fnx, fny, fnz],
        };
      }
      prevX = bx;
      prevY = by;
      prevZ = bz;
    }
  }
  return null;
}

// ============================================================
// BLOCK HIGHLIGHT
// ============================================================
function BlockHighlight({ blocksRef }: { blocksRef: React.MutableRefObject<Map<string, BlockType>> }) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const hit = raycastBlocks(camera.position, dir, blocksRef.current, REACH_DISTANCE);

    if (hit) {
      meshRef.current.visible = true;
      meshRef.current.position.set(hit.hitPos[0], hit.hitPos[1], hit.hitPos[2]);
    } else {
      meshRef.current.visible = false;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1.005, 1.005, 1.005]} />
      <meshBasicMaterial color="white" wireframe transparent opacity={0.5} depthTest={false} />
    </mesh>
  );
}

// ============================================================
// WEATHER PARTICLES
// ============================================================
function WeatherParticles({ type, playerPos }: { type: 'rain' | 'snow'; playerPos: React.MutableRefObject<THREE.Vector3> }) {
  const count = type === 'rain' ? 4000 : 2000;
  const pointsRef = useRef<THREE.Points>(null);

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 80;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 80;
      vel[i] = type === 'rain' ? 0.4 + Math.random() * 0.3 : 0.04 + Math.random() * 0.04;
    }
    return [pos, vel];
  }, [count, type]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const arr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const t = state.clock.elapsedTime;
    const px = playerPos.current.x;
    const pz = playerPos.current.z;

    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= velocities[i];
      if (type === 'snow') {
        arr[i * 3] += Math.sin(t * 0.5 + i * 0.1) * 0.02;
        arr[i * 3 + 2] += Math.cos(t * 0.3 + i * 0.1) * 0.02;
      }
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3] = px + (Math.random() - 0.5) * 80;
        arr[i * 3 + 1] = 35 + Math.random() * 10;
        arr[i * 3 + 2] = pz + (Math.random() - 0.5) * 80;
      }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color={type === 'rain' ? '#8cb4e0' : '#ffffff'}
        size={type === 'rain' ? 0.12 : 0.18}
        transparent
        opacity={type === 'rain' ? 0.6 : 0.85}
      />
    </points>
  );
}

// ============================================================
// STARS
// ============================================================
function Stars({ opacity }: { opacity: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(1500 * 3);
    for (let i = 0; i < 1500; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 180 + Math.random() * 20;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const mat = pointsRef.current.material as THREE.PointsMaterial;
    const t = state.clock.elapsedTime;
    mat.opacity = opacity * (0.8 + Math.sin(t * 0.5) * 0.2);
  });

  if (opacity < 0.01) return null;

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={1500}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={1.2}
        transparent
        opacity={opacity}
        sizeAttenuation={false}
        depthWrite={false}
      />
    </points>
  );
}

// ============================================================
// SUN MESH
// ============================================================
function SunMesh({ position }: { position: [number, number, number] }) {
  if (position[1] < -10) return null;

  return (
    <group position={position}>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#ffe866" depthWrite={false} />
      </mesh>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[9, 16, 16]} />
        <meshBasicMaterial color="#ffcc33" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ============================================================
// MOON MESH
// ============================================================
function MoonMesh({ position }: { position: [number, number, number] }) {
  if (position[1] < -10) return null;

  return (
    <group position={position}>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshBasicMaterial color="#e8e8f0" depthWrite={false} />
      </mesh>
      <mesh frustumCulled={false}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#aaaacc" transparent opacity={0.15} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ============================================================
// SKY DOME
// ============================================================
function SkyDome({ topColor, bottomColor }: { topColor: THREE.Color; bottomColor: THREE.Color }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const topRef = useRef(topColor.clone());
  const bottomRef = useRef(bottomColor.clone());

  const uniforms = useMemo(() => ({
    topColor: { value: new THREE.Color('#4a90d9') },
    bottomColor: { value: new THREE.Color('#87CEEB') },
  }), []);

  useFrame(() => {
    if (!matRef.current) return;
    // Smoothly interpolate towards target colors
    topRef.current.lerp(topColor, 0.03);
    bottomRef.current.lerp(bottomColor, 0.03);
    matRef.current.uniforms.topColor.value.copy(topRef.current);
    matRef.current.uniforms.bottomColor.value.copy(bottomRef.current);
  });

  const vertexShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition).y;
      float t = max(0.0, h);
      gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
    }
  `;

  return (
    <mesh scale={[-1, 1, 1]} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ============================================================
// CLOUDS
// ============================================================
function Clouds({ dayFactor }: { dayFactor: number }) {
  const groupRef = useRef<THREE.Group>(null);

  const cloudData = useMemo(() => {
    const data: { pos: [number, number, number]; parts: { x: number; y: number; z: number; s: number }[] }[] = [];
    for (let i = 0; i < 25; i++) {
      const parts: { x: number; y: number; z: number; s: number }[] = [];
      const numParts = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < numParts; j++) {
        parts.push({
          x: (Math.random() - 0.5) * 6,
          y: (Math.random() - 0.5) * 1.5,
          z: (Math.random() - 0.5) * 4,
          s: 1.5 + Math.random() * 2,
        });
      }
      data.push({
        pos: [(Math.random() - 0.5) * 200, 30 + Math.random() * 15, (Math.random() - 0.5) * 200],
        parts,
      });
    }
    return data;
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        child.position.x += 0.008 * (1 + (i % 3) * 0.3);
        if (child.position.x > 120) child.position.x = -120;
      });
    }
  });

  const brightness = 0.6 + dayFactor * 0.4;

  return (
    <group ref={groupRef}>
      {cloudData.map((cloud, i) => (
        <group key={i} position={cloud.pos}>
          {cloud.parts.map((part, j) => (
            <mesh key={j} position={[part.x, part.y, part.z]} frustumCulled={false}>
              <sphereGeometry args={[part.s, 6, 6]} />
              <meshBasicMaterial
                color={new THREE.Color(brightness, brightness, brightness)}
                transparent
                opacity={0.75}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

// ============================================================
// FOG CONTROLLER — smooth interpolation instead of jumping
// ============================================================
function FogController({ dayNightState, weather }: { dayNightState: DayNightState; weather: string }) {
  const scene = useThree(state => state.scene);
  const fogRef = useRef({ color: new THREE.Color('#87CEEB'), near: 60, far: 150 });

  useFrame(() => {
    if (!(scene.fog instanceof THREE.Fog)) return;

    let targetColor: THREE.Color;
    let targetNear: number;
    let targetFar: number;

    if (weather === 'rain') {
      targetColor = new THREE.Color('#4a5568');
      targetNear = 20;
      targetFar = 60;
    } else if (weather === 'snow') {
      targetColor = new THREE.Color('#c8cdd0');
      targetNear = 15;
      targetFar = 50;
    } else {
      targetColor = dayNightState.fogColor;
      targetNear = dayNightState.fogNear;
      targetFar = dayNightState.fogFar;
    }

    // Smoothly interpolate fog values
    fogRef.current.color.lerp(targetColor, 0.02);
    fogRef.current.near += (targetNear - fogRef.current.near) * 0.02;
    fogRef.current.far += (targetFar - fogRef.current.far) * 0.02;

    scene.fog.color.copy(fogRef.current.color);
    scene.fog.near = fogRef.current.near;
    scene.fog.far = fogRef.current.far;
  });

  return null;
}

// ============================================================
// PLAYER CONTROLLER
// ============================================================
function PlayerController({
  blocksRef,
  setBlocks,
  selectedBlockRef,
  isFlying,
  setIsFlying,
  playerPosRef,
}: {
  blocksRef: React.MutableRefObject<Map<string, BlockType>>;
  setBlocks: (fn: (prev: Map<string, BlockType>) => Map<string, BlockType>) => void;
  selectedBlockRef: React.MutableRefObject<BlockType>;
  isFlying: boolean;
  setIsFlying: (v: boolean) => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const { camera } = useThree();

  const velocity = useRef(new THREE.Vector3());
  const onGround = useRef(false);
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const keys = useRef<Set<string>>(new Set());
  const mouseSensitivity = 0.002;
  const isFlyingRef = useRef(isFlying);

  isFlyingRef.current = isFlying;

  const isBlockSolid = useCallback((bx: number, by: number, bz: number): boolean => {
    const key = toKey(Math.round(bx), Math.round(by), Math.round(bz));
    const block = blocksRef.current.get(key);
    return !!block && block !== 'water';
  }, [blocksRef]);

  const checkCollision = useCallback((px: number, py: number, pz: number): boolean => {
    const r = PLAYER_RADIUS;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 2; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bx = Math.round(px + dx * r);
          const by = Math.round(py - PLAYER_HEIGHT + dy);
          const bz = Math.round(pz + dz * r);
          if (isBlockSolid(bx, by, bz)) {
            const blockMinX = bx - 0.5, blockMaxX = bx + 0.5;
            const blockMinY = by - 0.5, blockMaxY = by + 0.5;
            const blockMinZ = bz - 0.5, blockMaxZ = bz + 0.5;

            const playerMinX = px - r, playerMaxX = px + r;
            const playerMinY = py - PLAYER_HEIGHT, playerMaxY = py + 0.1;
            const playerMinZ = pz - r, playerMaxZ = pz + r;

            if (playerMaxX > blockMinX && playerMinX < blockMaxX &&
                playerMaxY > blockMinY && playerMinY < blockMaxY &&
                playerMaxZ > blockMinZ && playerMinZ < blockMaxZ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }, [isBlockSolid]);

  // Initialize camera
  useEffect(() => {
    const spawnY = getTerrainHeight(0, 0) + 3;
    camera.position.set(0, spawnY, 0);
    euler.current.setFromQuaternion(camera.quaternion);
  }, [camera]);

  // Mouse look
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      euler.current.y -= e.movementX * mouseSensitivity;
      euler.current.x -= e.movementY * mouseSensitivity;
      euler.current.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
    };

    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [camera]);

  // Key events
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (e.code === 'KeyF') {
        setIsFlying(!isFlyingRef.current);
        velocity.current.y = 0;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [setIsFlying]);

  // Mouse click for block break/place
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;

      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const hit = raycastBlocks(camera.position, dir, blocksRef.current, REACH_DISTANCE);
      if (!hit) return;

      if (e.button === 0) {
        if (blocksRef.current.get(hit.hitKey) === 'bedrock') return;
        setBlocks(prev => {
          const next = new Map(prev);
          next.delete(hit.hitKey);
          return next;
        });
      } else if (e.button === 2) {
        const [hx, hy, hz] = hit.hitPos;
        const [nx, ny, nz] = hit.faceNormal;
        const px = hx + nx;
        const py = hy + ny;
        const pz = hz + nz;
        const newKey = toKey(px, py, pz);

        const cp = camera.position;
        if (Math.abs(px - Math.round(cp.x)) <= 0 &&
            py >= Math.round(cp.y - PLAYER_HEIGHT) && py <= Math.round(cp.y) &&
            Math.abs(pz - Math.round(cp.z)) <= 0) {
          return;
        }

        if (!blocksRef.current.has(newKey)) {
          setBlocks(prev => {
            const next = new Map(prev);
            next.set(newKey, selectedBlockRef.current);
            return next;
          });
        }
      }
    };

    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener('mousedown', onClick);
    window.addEventListener('contextmenu', onContext);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('contextmenu', onContext);
    };
  }, [camera, setBlocks, blocksRef, selectedBlockRef]);

  // Game loop
  useFrame((_, rawDelta) => {
    if (!document.pointerLockElement) return;

    const delta = Math.min(rawDelta, 0.05);
    const flying = isFlyingRef.current;
    const speed = flying ? FLY_SPEED : (keys.current.has('ShiftLeft') ? WALK_SPEED * SPRINT_MULTIPLIER : WALK_SPEED);

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    if (!flying) forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    let moveX = 0, moveZ = 0, moveY = 0;
    if (keys.current.has('KeyW')) { moveX += forward.x; moveZ += forward.z; if (flying) moveY += forward.y; }
    if (keys.current.has('KeyS')) { moveX -= forward.x; moveZ -= forward.z; if (flying) moveY -= forward.y; }
    if (keys.current.has('KeyD')) { moveX += right.x; moveZ += right.z; }
    if (keys.current.has('KeyA')) { moveX -= right.x; moveZ -= right.z; }

    const inputLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (inputLen > 0) {
      moveX /= inputLen;
      moveZ /= inputLen;
    }

    const targetVX = moveX * speed;
    const targetVZ = moveZ * speed;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    velocity.current.x += (targetVX - velocity.current.x) * lerpFactor;
    velocity.current.z += (targetVZ - velocity.current.z) * lerpFactor;

    if (flying) {
      let targetVY = moveY * speed;
      if (keys.current.has('Space')) targetVY += speed;
      if (keys.current.has('ShiftLeft')) targetVY -= speed;
      velocity.current.y += (targetVY - velocity.current.y) * lerpFactor;
    } else {
      velocity.current.y -= GRAVITY * delta;
      if (velocity.current.y < -40) velocity.current.y = -40;

      if (keys.current.has('Space') && onGround.current) {
        velocity.current.y = JUMP_FORCE;
        onGround.current = false;
      }
    }

    const pos = camera.position;

    const newX = pos.x + velocity.current.x * delta;
    if (!checkCollision(newX, pos.y, pos.z)) {
      pos.x = newX;
    } else {
      velocity.current.x = 0;
    }

    const newZ = pos.z + velocity.current.z * delta;
    if (!checkCollision(pos.x, pos.y, newZ)) {
      pos.z = newZ;
    } else {
      velocity.current.z = 0;
    }

    const newY = pos.y + velocity.current.y * delta;
    if (!checkCollision(pos.x, newY, pos.z)) {
      pos.y = newY;
      onGround.current = false;
    } else {
      if (velocity.current.y < 0) {
        onGround.current = true;
      }
      velocity.current.y = 0;
    }

    if (pos.y < 1) {
      pos.y = 1;
      velocity.current.y = 0;
      onGround.current = true;
    }

    playerPosRef.current.copy(pos);
  });

  return null;
}

// ============================================================
// MINIMAP
// ============================================================
function MiniMap({ blocks, playerPos, isOpen, onClose }: {
  blocks: Map<string, BlockType>;
  playerPos: THREE.Vector3;
  isOpen: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 300;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, size, size);

    const scale = 2;
    const centerX = playerPos.x;
    const centerZ = playerPos.z;

    for (let sx = 0; sx < size; sx++) {
      for (let sz = 0; sz < size; sz++) {
        const wx = Math.round(centerX + (sx - size / 2) / scale);
        const wz = Math.round(centerZ + (sz - size / 2) / scale);

        let topType: BlockType | null = null;
        for (let y = 25; y >= 0; y--) {
          const key = toKey(wx, y, wz);
          const bt = blocks.get(key);
          if (bt) {
            topType = bt;
            break;
          }
        }

        if (topType) {
          ctx.fillStyle = BLOCK_COLORS[topType];
          ctx.fillRect(sx, sz, 1, 1);
        }
      }
    }

    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

  }, [isOpen, blocks, playerPos]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="bg-gray-900 p-4 rounded-lg border-2 border-amber-500" onClick={e => e.stopPropagation()}>
        <h2 className="text-amber-400 text-xl font-bold mb-2 text-center font-mono">WORLD MAP</h2>
        <canvas ref={canvasRef} className="rounded border border-gray-700" style={{ imageRendering: 'pixelated' }} />
        <p className="text-gray-400 text-xs mt-2 text-center">Press M or click outside to close</p>
      </div>
    </div>
  );
}

// ============================================================
// SCENE
// ============================================================
function Scene({
  blocks,
  setBlocks,
  blocksRef,
  selectedBlockRef,
  isFlying,
  setIsFlying,
  playerPosRef,
  weather,
  dayNightState,
}: {
  blocks: Map<string, BlockType>;
  setBlocks: (fn: (prev: Map<string, BlockType>) => Map<string, BlockType>) => void;
  blocksRef: React.MutableRefObject<Map<string, BlockType>>;
  selectedBlockRef: React.MutableRefObject<BlockType>;
  isFlying: boolean;
  setIsFlying: (v: boolean) => void;
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  weather: string;
  dayNightState: DayNightState;
}) {
  const dns = dayNightState;

  const weatherAmbientMod = weather === 'rain' ? 0.5 : weather === 'snow' ? 0.6 : 1.0;
  const weatherSunMod = weather === 'rain' ? 0.2 : weather === 'snow' ? 0.3 : 1.0;

  return (
    <>
      <SkyDome
        topColor={weather !== 'clear' ? new THREE.Color('#4a5060') : dns.skyTopColor}
        bottomColor={weather !== 'clear' ? new THREE.Color('#6b7080') : dns.skyBottomColor}
      />

      <fog attach="fog" args={['#87CEEB', 60, 150]} />

      <FogController dayNightState={dayNightState} weather={weather} />

      <SunMesh position={dns.sunPosition} />
      <MoonMesh position={dns.moonPosition} />

      {weather === 'clear' && <Stars opacity={dns.starsOpacity} />}

      <ambientLight
        intensity={dns.ambientIntensity * weatherAmbientMod}
        color={dns.sunColor}
      />
      <directionalLight
        position={dns.sunPosition}
        intensity={dns.sunIntensity * weatherSunMod}
        color={dns.sunColor}
      />
      {dns.starsOpacity > 0.1 && (
        <directionalLight
          position={dns.moonPosition}
          intensity={0.15 * dns.starsOpacity}
          color="#6666aa"
        />
      )}
      <hemisphereLight
        args={[
          dns.skyTopColor.clone().multiplyScalar(0.5),
          new THREE.Color('#3a5c1e'),
          0.2 + dns.dayFactor * 0.2,
        ]}
      />

      <ChunkMesh blocks={blocks} />
      <BlockHighlight blocksRef={blocksRef} />
      <Clouds dayFactor={dns.dayFactor} />

      {weather === 'rain' && <WeatherParticles type="rain" playerPos={playerPosRef} />}
      {weather === 'snow' && <WeatherParticles type="snow" playerPos={playerPosRef} />}

      <PlayerController
        blocksRef={blocksRef}
        setBlocks={setBlocks}
        selectedBlockRef={selectedBlockRef}
        isFlying={isFlying}
        setIsFlying={setIsFlying}
        playerPosRef={playerPosRef}
      />
    </>
  );
}

// ============================================================
// CROSSHAIR
// ============================================================
function Crosshair() {
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <line x1="12" y1="4" x2="12" y2="10" stroke="white" strokeWidth="2" opacity="0.8" />
        <line x1="12" y1="14" x2="12" y2="20" stroke="white" strokeWidth="2" opacity="0.8" />
        <line x1="4" y1="12" x2="10" y2="12" stroke="white" strokeWidth="2" opacity="0.8" />
        <line x1="14" y1="12" x2="20" y2="12" stroke="white" strokeWidth="2" opacity="0.8" />
      </svg>
    </div>
  );
}

// ============================================================
// TIME-OF-DAY ICON
// ============================================================
function getTimeIcon(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case 'dawn': return '🌅';
    case 'morning': return '🌄';
    case 'day': return '☀️';
    case 'afternoon': return '🌤️';
    case 'sunset': return '🌇';
    case 'dusk': return '🌆';
    case 'night': return '🌙';
    case 'late_night': return '🌑';
  }
}

// ============================================================
// DAY/NIGHT CYCLE PROGRESS BAR
// ============================================================
function DayCycleBar({ progress, gameHour }: { progress: number; gameHour: number }) {
  const sunX = progress * 100;

  return (
    <div className="w-40 h-3 rounded-full overflow-hidden relative border border-white/20" style={{
      background: 'linear-gradient(90deg, #1a1a3e 0%, #1a1a3e 18%, #e8a040 23%, #87CEEB 30%, #4a90d9 50%, #87CEEB 70%, #e8a040 77%, #1a1a3e 82%, #1a1a3e 100%)',
    }}>
      <div
        className="absolute top-0 h-full w-1 bg-white rounded-full shadow-lg"
        style={{
          left: `${sunX}%`,
          boxShadow: gameHour >= 6 && gameHour <= 19 ? '0 0 4px #ffe866' : '0 0 4px #aaaacc',
        }}
      />
    </div>
  );
}

// ============================================================
// HUD — uses refs to avoid re-renders
// ============================================================
function HUD({
  playerPosRef,
  blocks,
  isFlying,
  weather,
  dayNightState,
  timeSpeed,
}: {
  playerPosRef: React.MutableRefObject<THREE.Vector3>;
  blocks: Map<string, BlockType>;
  isFlying: boolean;
  weather: string;
  dayNightState: DayNightState;
  timeSpeed: number;
}) {
  const posRef = useRef<HTMLDivElement>(null);

  // Update position display via ref, not state, to prevent re-renders
  useEffect(() => {
    let animFrame: number;
    const update = () => {
      if (posRef.current) {
        const p = playerPosRef.current;
        posRef.current.textContent = `XYZ: ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}`;
      }
      animFrame = requestAnimationFrame(update);
    };
    animFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrame);
  }, [playerPosRef]);

  return (
    <>
      <Crosshair />

      {/* Debug info */}
      <div className="absolute top-3 left-3 z-30 font-mono text-xs bg-black/60 text-white/80 px-3 py-2 rounded-md space-y-1">
        <div ref={posRef}>XYZ: 0.0 / 0.0 / 0.0</div>
        <div>Blocks: {blocks.size.toLocaleString()}</div>
        <div>
          {isFlying ? '✈️ Flying' : '🚶 Walking'}
          {' · '}
          {weather === 'clear' ? '☀️ Clear' : weather === 'rain' ? '🌧️ Rain' : '❄️ Snow'}
        </div>
      </div>

      {/* Time of day display */}
      <div className="absolute top-3 right-3 z-30 font-mono text-xs bg-black/60 text-white/80 px-3 py-2 rounded-md space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getTimeIcon(dayNightState.timeOfDay)}</span>
          <div>
            <div className="text-amber-300 font-bold">{formatGameTime(dayNightState.gameHour)}</div>
            <div className="text-white/60">{dayNightState.timeLabel}</div>
          </div>
        </div>
        <DayCycleBar progress={dayNightState.progress} gameHour={dayNightState.gameHour} />
        {timeSpeed > 1 && (
          <div className="text-yellow-400 text-center">⏩ {timeSpeed}x speed</div>
        )}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-4 right-3 z-30 text-white/40 text-[10px] font-mono space-y-0.5 text-right">
        <div>[F] Fly · [R] Weather · [T] Time Speed</div>
        <div>[N] Night · [B] Day · [M] Map</div>
      </div>
    </>
  );
}

// ============================================================
// APP
// ============================================================
export default function App() {
  const [blocks, setBlocks] = useState<Map<string, BlockType>>(new Map());
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('dirt');
  const [isLocked, setIsLocked] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const [weather, setWeather] = useState<'clear' | 'rain' | 'snow'>('clear');
  const [showMap, setShowMap] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isWorldLoaded, setIsWorldLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameTime, setGameTime] = useState(DAY_CYCLE_DURATION * 0.375);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const playerPosRef = useRef(new THREE.Vector3(0, 15, 0));
  const blocksRef = useRef<Map<string, BlockType>>(new Map());
  const selectedBlockRef = useRef<BlockType>('dirt');

  // Keep refs in sync
  blocksRef.current = blocks;
  selectedBlockRef.current = selectedBlock;

  // Day/Night cycle ticker — only when game started
  useEffect(() => {
    if (!gameStarted) return;

    let lastTime = performance.now();
    let animFrame: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setGameTime(prev => prev + dt * timeSpeed);
      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [timeSpeed, gameStarted]);

  const dayNightState = useMemo(() => getDayNightState(gameTime), [gameTime]);

  // Generate world with progress
  useEffect(() => {
    let cancelled = false;

    // Simulate progressive loading for visual feedback
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 200);

    // Actually generate the world
    requestAnimationFrame(() => {
      const world = generateWorld();
      if (!cancelled) {
        setBlocks(world.blocks);
        clearInterval(progressInterval);
        setLoadingProgress(100);
        setIsWorldLoaded(true);
      }
    });

    return () => {
      cancelled = true;
      clearInterval(progressInterval);
    };
  }, []);

  // Handle splash screen play button
  const handleSplashPlay = useCallback(() => {
    setShowSplash(false);
    setGameStarted(true);
  }, []);

  // Pointer lock handling
  const handleCanvasClick = useCallback(() => {
    if (!document.pointerLockElement && gameStarted) {
      document.body.requestPointerLock();
    }
  }, [gameStarted]);

  useEffect(() => {
    const onLockChange = () => {
      setIsLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!gameStarted) return;

      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && HOTBAR_BLOCKS[num - 1]) {
        setSelectedBlock(HOTBAR_BLOCKS[num - 1]);
      }

      if (e.code === 'KeyR' && isLocked) {
        setWeather(prev => prev === 'clear' ? 'rain' : prev === 'rain' ? 'snow' : 'clear');
      }

      if (e.code === 'KeyM' && isLocked) {
        setShowMap(prev => !prev);
      }

      if (e.code === 'KeyT' && isLocked) {
        setTimeSpeed(prev => prev === 1 ? 10 : prev === 10 ? 50 : prev === 50 ? 100 : 1);
      }

      if (e.code === 'KeyN' && isLocked) {
        setGameTime(DAY_CYCLE_DURATION * 0.875);
      }
      if (e.code === 'KeyB' && isLocked) {
        setGameTime(DAY_CYCLE_DURATION * 0.375);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLocked, gameStarted]);

  // Scroll wheel
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!isLocked) return;
      const idx = HOTBAR_BLOCKS.indexOf(selectedBlock);
      let newIdx: number;
      if (e.deltaY > 0) {
        newIdx = (idx + 1) % HOTBAR_BLOCKS.length;
      } else {
        newIdx = (idx - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
      }
      setSelectedBlock(HOTBAR_BLOCKS[newIdx]);
    };
    window.addEventListener('wheel', onWheel);
    return () => window.removeEventListener('wheel', onWheel);
  }, [isLocked, selectedBlock]);

  // Show splash screen
  if (showSplash) {
    return (
      <SplashScreen
        loadingProgress={Math.min(loadingProgress, 100)}
        isLoaded={isWorldLoaded}
        onPlay={handleSplashPlay}
      />
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden select-none" onClick={handleCanvasClick}>
      {/* Pause/Resume overlay when not locked */}
      {!isLocked && gameStarted && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 cursor-pointer">
          <div className="text-center p-8 rounded-lg border-2 border-gray-700 bg-[#1a1a1a]/95 max-w-sm">
            <h2 className="text-3xl font-black mb-2 tracking-tight" style={{
              color: '#e8c840',
              textShadow: '2px 2px 0px #8b6b3d',
            }}>
              GAME PAUSED
            </h2>
            <p className="text-gray-400 mb-6 text-sm">Click anywhere to resume</p>

            <div className="flex flex-col gap-1.5 text-xs text-gray-500 bg-black/40 p-3 rounded">
              <div className="flex justify-between"><span className="text-gray-400">WASD</span><span>Move</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Space</span><span>Jump / Fly Up</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Shift</span><span>Sprint / Fly Down</span></div>
              <div className="flex justify-between"><span className="text-gray-400">F</span><span>Toggle Flying</span></div>
              <div className="flex justify-between"><span className="text-gray-400">LMB / RMB</span><span>Break / Place</span></div>
              <div className="flex justify-between"><span className="text-gray-400">1-9 / Scroll</span><span>Select Block</span></div>
              <div className="flex justify-between"><span className="text-gray-400">R</span><span>Weather</span></div>
              <div className="flex justify-between"><span className="text-gray-400">T / N / B</span><span>Time Controls</span></div>
              <div className="flex justify-between"><span className="text-gray-400">M</span><span>Map</span></div>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      {isLocked && (
        <>
          <HUD
            playerPosRef={playerPosRef}
            blocks={blocks}
            isFlying={isFlying}
            weather={weather}
            dayNightState={dayNightState}
            timeSpeed={timeSpeed}
          />

          {/* Hotbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
            <div className="flex gap-0.5 bg-black/70 p-1 rounded-lg border border-gray-700">
              {HOTBAR_BLOCKS.map((type, i) => (
                <button
                  key={type}
                  onMouseDown={(e) => { e.stopPropagation(); setSelectedBlock(type); }}
                  className={`w-12 h-12 rounded flex flex-col items-center justify-center transition-all relative ${
                    selectedBlock === type
                      ? 'bg-white/20 ring-2 ring-amber-400 scale-110'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="w-7 h-7 rounded-sm border border-black/30" style={{ backgroundColor: BLOCK_COLORS[type] }}>
                    {type === 'glass' && (
                      <div className="w-full h-full bg-white/20 rounded-sm" />
                    )}
                  </div>
                  <span className="text-white/60 text-[10px] mt-0.5">{i + 1}</span>
                  {selectedBlock === type && (
                    <div className="absolute -bottom-5 text-amber-400 text-[10px] font-mono whitespace-nowrap">
                      {BLOCK_NAMES[type]}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* World Map */}
      <MiniMap
        blocks={blocks}
        playerPos={playerPosRef.current}
        isOpen={showMap}
        onClose={() => setShowMap(false)}
      />

      {/* 3D Canvas */}
      <Canvas
        camera={{ fov: 70, near: 0.1, far: 500 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Scene
          blocks={blocks}
          setBlocks={setBlocks}
          blocksRef={blocksRef}
          selectedBlockRef={selectedBlockRef}
          isFlying={isFlying}
          setIsFlying={setIsFlying}
          playerPosRef={playerPosRef}
          weather={weather}
          dayNightState={dayNightState}
        />
      </Canvas>
    </div>
  );
}
