import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Float, Stars, Center, Bounds } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, SkipBack, SkipForward, Info, Lock, Key, Hash, RefreshCw, Layers, Cpu, Box, Minimize2, Maximize2, Unlock, Locate } from 'lucide-react';
import confetti from 'canvas-confetti';
import { DifferentialAttackTab } from './DifferentialAttackTab';
import { IntegralAttackTab } from './IntegralAttackTab';
import { mantisCipher, createEmptyState, State, MantisStep, flattenState } from './lib/mantis';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- 3D COMPONENTS ---

const NIBBLE_COLORS = [
  '#06b6d4', // 0 (Cyan 500)
  '#0891b2', // 1
  '#0e7490', // 2
  '#155e75', // 3
  '#164e63', // 4
  '#22d3ee', // 5
  '#67e8f9', // 6
  '#a5f3fc', // 7
  '#06b6d4', // 8
  '#0891b2', // 9
  '#0e7490', // a
  '#155e75', // b
  '#f59e0b', // c (Amber for variety)
  '#d97706', // d
  '#b45309', // e
  '#92400e', // f
];

import * as THREE from 'three';
import { SHUFFLE, SHUFFLE_INV, H_PERM } from './lib/mantis';

interface AnimatedCellProps {
  id: number;
  value: number;
  targetPos: [number, number, number];
  scale?: number;
  isChanging?: boolean;
  opType?: string;
  stepIndex: number;
  showValues?: boolean;
  xorVal?: number;
  prevValue?: number;
  speed?: number;
  rtCombineVals?: { tweak: number, rk: number, rc: number };
  stepName?: string;
}

function AnimatedCell({ id, value, targetPos, scale = 1, isChanging, opType, stepIndex, showValues = true, xorVal, prevValue, speed = 3500, rtCombineVals, stepName = '' }: AnimatedCellProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const color = showValues ? NIBBLE_COLORS[displayValue % 16] : '#1e293b';
  
  const [initPos] = useState<[number, number, number]>(() => [...targetPos] as [number, number, number]);
  const [stepStartTime, setStepStartTime] = useState(Date.now());

  useEffect(() => {
    setStepStartTime(Date.now());
    
    let timer: any;
    if (isChanging && (opType === 'sub_cells' || opType === 'mix_columns' || opType === 'add_tweakey' || opType === 'lfsr' || opType === 'rk_update' || opType === 'rt_update')) {
      setDisplayValue(prevValue !== undefined ? prevValue : value);
      timer = setTimeout(() => {
        setDisplayValue(value);
      }, speed * 0.11);
    } else {
      setDisplayValue(value);
    }
    
    return () => clearTimeout(timer);
  }, [stepIndex, value, prevValue, isChanging, opType, speed]);

  useFrame((state, delta) => {
    const speedRatio = 3500 / speed;

    if (groupRef.current) {
      const isMoving = opType === 'shuffle_cells' || opType === 'tweak_shuffle';
      const baseDamp = isMoving ? 1.0 : 4;
      const dampFactor = baseDamp * speedRatio * speedRatio;
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, targetPos[0], dampFactor, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetPos[1], dampFactor, delta);
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, targetPos[2], dampFactor, delta);

      const targetScale = (isChanging && !isMoving) ? 1.05 * scale : 1.0 * scale;
      groupRef.current.scale.setScalar(THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 8 * speedRatio, delta));
    }
    
    if (meshRef.current) {
      const t = (Date.now() - stepStartTime) / (speed * 0.28);
      if (opType === 'sub_cells' && isChanging) {
        if (t < 0.8) {
          const intensity = Math.max(0, 1 - (t / 0.8));
          meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 40 * speedRatio) * 0.1 * intensity;
          meshRef.current.position.x = Math.sin(state.clock.elapsedTime * 50 * speedRatio) * 0.05 * intensity;
        } else {
          meshRef.current.rotation.z = THREE.MathUtils.damp(meshRef.current.rotation.z, 0, 10 * speedRatio, delta);
          meshRef.current.position.x = THREE.MathUtils.damp(meshRef.current.position.x, 0, 10 * speedRatio, delta);
        }
      } else if (opType === 'lfsr' && isChanging) {
        // Make LFSR visually shift left and snap back to represent a shift register
        if (t < 0.8) {
          meshRef.current.position.x = -Math.sin((t / 0.8) * Math.PI) * 0.15;
        } else {
          meshRef.current.position.x = THREE.MathUtils.damp(meshRef.current.position.x, 0, 10 * speedRatio, delta);
        }
      } else if (opType === 'rk_update' && isChanging) {
        // ROR visual (little flip)
        if (t < 0.8) {
          meshRef.current.rotation.x = Math.min(1, t / 0.6) * Math.PI * 2;
        } else {
           meshRef.current.rotation.x = 0;
        }
      } else if (opType === 'mix_columns' && isChanging) {
        if (t < 0.8) {
          meshRef.current.rotation.y = Math.min(1, t / 0.8) * Math.PI * 2;
        } else {
          meshRef.current.rotation.y = 0;
        }
      } else {
        meshRef.current.rotation.z = THREE.MathUtils.damp(meshRef.current.rotation.z, 0, 10 * speedRatio, delta);
        if (meshRef.current.rotation.y > 0) {
          meshRef.current.rotation.y = 0;
        }
        if (meshRef.current.rotation.x > 0) {
          meshRef.current.rotation.x = 0;
        }
        meshRef.current.position.x = THREE.MathUtils.damp(meshRef.current.position.x, 0, 10 * speedRatio, delta);
      }
    }
  });

  let emissiveColor = '#000000';
  let emissiveIntensity = 0;
  if (isChanging) {
    if (opType === 'mix_columns') {
      emissiveColor = '#06b6d4';
      emissiveIntensity = 0.8;
    } else if (opType === 'add_tweakey') {
      emissiveColor = '#f59e0b';
      emissiveIntensity = 0.8;
    } else if (opType === 'sub_cells') {
      emissiveColor = color;
      emissiveIntensity = 0.6;
    } else if (opType === 'shuffle_cells' || opType === 'tweak_shuffle') {
      emissiveColor = color;
      emissiveIntensity = 0.3;
    } else if (opType === 'lfsr') {
      emissiveColor = '#ec4899';
      emissiveIntensity = 0.6;
    } else if (opType === 'rk_update') {
      emissiveColor = '#a855f7';
      emissiveIntensity = 0.6;
    } else if (opType === 'rt_update') {
      emissiveColor = '#22c55e';
      emissiveIntensity = 0.6;
    } else {
      emissiveColor = color;
      emissiveIntensity = 0.5;
    }
  }

  // Display operation details logic
  const isMovingCheck = opType === 'shuffle_cells' || opType === 'tweak_shuffle';

  let opText = null;
  if (rtCombineVals) {
    opText = (
      <group position={[0, 0.6, 0.4]}>
        <Text position={[0, 0.15, 0]} fontSize={0.16} color="#ffffff" anchorX="center" anchorY="middle">
          {rtCombineVals.tweak.toString(16).toUpperCase()} ⊕ {rtCombineVals.rk.toString(16).toUpperCase()} ⊕ {rtCombineVals.rc.toString(16).toUpperCase()}
        </Text>
        <Text position={[0, -0.15, 0]} fontSize={0.16} color="#f59e0b" anchorX="center" anchorY="middle">
          = {value.toString(16).toUpperCase()}
        </Text>
      </group>
    );
  } else if (isChanging) {
    if (opType === 'add_tweakey' && xorVal !== undefined) {
      opText = <Text position={[0, 0.6, 0.4]} fontSize={0.25} color="#f59e0b" anchorX="center" anchorY="middle">⊕ {xorVal.toString(16).toUpperCase()}</Text>;
    } else if (opType === 'sub_cells') {
      const isInv = stepName.toLowerCase().includes('invsubcells');
      const valStr = prevValue !== undefined ? prevValue.toString(16).toUpperCase() : displayValue.toString(16).toUpperCase();
      if (isInv) {
        opText = (
          <group position={[0, 0.6, 0.4]}>
            <Text position={[-0.14, 0, 0]} fontSize={0.25} color="#06b6d4" anchorX="right" anchorY="middle">S</Text>
            <Text position={[-0.14, 0.1, 0]} fontSize={0.15} color="#06b6d4" anchorX="left" anchorY="middle">-1</Text>
            <Text position={[0.08, 0, 0]} fontSize={0.25} color="#06b6d4" anchorX="left" anchorY="middle">{`(${valStr})`}</Text>
          </group>
        );
      } else {
        opText = <Text position={[0, 0.6, 0.4]} fontSize={0.25} color="#06b6d4" anchorX="center" anchorY="middle">{`S(${valStr})`}</Text>;
      }
    } else if (opType === 'lfsr') {
      opText = <Text position={[0, 0.6, 0.4]} fontSize={0.16} color="#ec4899" anchorX="center" anchorY="middle">LFSR Shift</Text>;
    } else if (opType === 'rk_update') {
      opText = <Text position={[0, 0.6, 0.4]} fontSize={0.18} color="#a855f7" anchorX="center" anchorY="middle">⊕ {xorVal !== undefined ? xorVal.toString(16).toUpperCase() : ''}</Text>;
    } else if (opType === 'rt_update') {
      opText = <Text position={[0, 0.6, 0.4]} fontSize={0.20} color="#22c55e" anchorX="center" anchorY="middle">⊕ {xorVal !== undefined ? xorVal.toString(16).toUpperCase() : 'TK'}</Text>;
    } else if (opType === 'mix_columns') {
      opText = <Text position={[0, -0.6, 0.4]} fontSize={0.18} color="#06b6d4" anchorX="center" anchorY="middle">M × Col</Text>;
    } else if (!isMovingCheck && xorVal !== undefined && xorVal !== 0) {
      // Fallback: if value changes via XOR in a generic process
      opText = <Text position={[0, 0.6, 0.4]} fontSize={0.25} color="#94a3b8" anchorX="center" anchorY="middle">⊕ {xorVal.toString(16).toUpperCase()}</Text>;
    }
  }

  return (
    <group ref={groupRef} position={initPos}>
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial 
          color={color} 
          metalness={0.7} 
          roughness={0.2} 
          transparent 
          opacity={0.8}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
        <Text
          position={[0, 0, 0.41]}
          fontSize={0.35}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {showValues && displayValue !== undefined ? displayValue.toString(16).toUpperCase() : ''}
        </Text>
        {opText}
      </mesh>
    </group>
  );
}

function MantisGrid({ 
  state, 
  previousState, 
  label, 
  position, 
  opType,
  stepIndex,
  cellPositions = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
  showValues = true,
  speed = 3500,
  scale = 1,
  xorState,
  rtCombineValsList
}: { 
  state: State; 
  previousState?: State;
  label: string; 
  position: [number, number, number];
  opType?: string;
  stepIndex: number;
  cellPositions?: number[];
  showValues?: boolean;
  speed?: number;
  scale?: number;
  xorState?: State;
  rtCombineValsList?: { tweak: number, rk: number, rc: number }[];
}) {
  const flatState = flattenState(state);
  const prevFlatState = previousState ? flattenState(previousState) : null;
  const flatXorState = xorState ? flattenState(xorState) : null;

  return (
    <group position={position} scale={scale}>
      <Text
        position={[2.25, 5, 0]}
        fontSize={0.35}
        color="#94a3b8"
        anchorX="center"
      >
        {label}
      </Text>
      {Array.from({ length: 16 }).map((_, id) => {
        const posIndex = cellPositions[id];
        const row = Math.floor(posIndex / 4);
        const col = posIndex % 4;
        
        const val = flatState[posIndex];
        const prevVal = prevFlatState ? prevFlatState[posIndex] : val;
        
        const valueChanged = prevFlatState ? (prevFlatState[posIndex] !== val) : false;
        const xorVal = flatXorState ? flatXorState[posIndex] : (prevFlatState ? (val ^ prevFlatState[posIndex]) : undefined);

        // Only animate LFSR or RK if the value actually changed, 
        // to avoid animating on every sub-step (like mix_columns) when the value is static.
        const shouldForceAnimate = (opType === 'shuffle_cells');
        const isChanging = valueChanged || shouldForceAnimate;

        return (
          <AnimatedCell 
            key={id}
            id={id}
            targetPos={[col * 1.5, -row * 1.5 + 4, 0]}
            value={val}
            prevValue={prevVal}
            opType={opType}
            stepIndex={stepIndex}
            scale={0.9}
            isChanging={isChanging}
            showValues={showValues}
            xorVal={xorVal}
            speed={speed}
            rtCombineVals={rtCombineValsList ? rtCombineValsList[posIndex] : undefined}
            stepName={label}
          />
        );
      })}
      {/* Grid Floor */}
      <mesh position={[2.25, 1.75, -0.4]}>
        <boxGeometry args={[6.5, 6.5, 0.1]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.1} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// --- MAIN APP ---

function getOperationDetail(type: string, name: string) {
  switch (type) {
    case 'initial': return "Loading state with Initial Plaintext structure.";
    case 'add_tweakey': return "XORing the state with the sub-tweakey. Sub-tweakey is derived from Key K0, K1, and Tweak T. Matrix cells are combined using bitwise XOR (⊕).";
    case 'sub_cells': 
      if (name.toLowerCase().includes('invsubcells')) {
        return "Applying non-linear inverse substitution using the 4-bit Inverse S-Box.";
      }
      return "Applying non-linear substitution using a 4-bit S-Box. Each nibble is mapped to a new value to provide confusion.";
    case 'shuffle_cells': return "Permuting the 16 nibbles across the 4x4 state matrix. This provides diffusion by spreading the bits.";
    case 'mix_columns': return "Multiplying each column of the state matrix by a fixed near-MDS matrix. This provides optimal diffusion within columns.";
    case 'mid': return "Applying middle transformations (SubCells, MixColumns, SubCells) to seamlessly link the forward and backward rounds.";
    case 'round_complete': return "Round complete. Displaying the resulting state matrix.";
    case 'final': return "Final operation yielding the CIPHERTEXT block.";
    default: return name;
  }
}

function unflatten(flat: number[]): State {
  const res = createEmptyState();
  flat.forEach((v, i) => (res[Math.floor(i / 4)][i % 4] = v));
  return res;
}

function HexInput({ value, onChange, className }: { value: State, onChange: (s: State) => void, className?: string }) {
  const [localVal, setLocalVal] = useState('');

  useEffect(() => {
    setLocalVal(flattenState(value).map(n => n.toString(16).toUpperCase()).join(''));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
    if (val.length > 16) val = val.slice(0, 16);
    setLocalVal(val);
    if (val.length === 16) {
      const flat = val.split('').map(c => parseInt(c, 16));
      onChange(unflatten(flat));
    }
  };

  return (
    <input 
      type="text" 
      value={localVal} 
      onChange={handleChange} 
      className={cn("bg-[#090a0c] border border-[#374151] p-2 font-mono text-[10px] w-full outline-none focus:border-cyan-500 transition-colors uppercase tracking-[0.2em]", className)}
      maxLength={16}
    />
  );
}

interface CameraManagerProps {
  viewMode: 'single' | 'compare';
  isPlaying: boolean;
  lockViewpoint: boolean;
  resetViewFlag: boolean;
  onResetDone: () => void;
}

function CameraManager({ viewMode, isPlaying, lockViewpoint, resetViewFlag, onResetDone }: CameraManagerProps) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [keys, setKeys] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      setKeys((k) => ({ ...k, [e.code]: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.code]: false }));
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (!controlsRef.current) return;
    
    if (resetViewFlag) {
      const targetPos = viewMode === 'compare' ? new THREE.Vector3(0, 1.5, 26) : new THREE.Vector3(0, 0, 16);
      const targetTarget = new THREE.Vector3(0, 0, 0);
      
      state.camera.position.lerp(targetPos, 5 * delta);
      controlsRef.current.target.lerp(targetTarget, 5 * delta);
      
      if (state.camera.position.distanceTo(targetPos) < 0.05 && controlsRef.current.target.distanceTo(targetTarget) < 0.05) {
        state.camera.position.copy(targetPos);
        controlsRef.current.target.copy(targetTarget);
        onResetDone();
      }
    } else {
      let panX = 0;
      let panY = 0;
      
      if (keys['ArrowUp'] || keys['KeyW']) panY += 1;
      if (keys['ArrowDown'] || keys['KeyS']) panY -= 1;
      if (keys['ArrowLeft'] || keys['KeyA']) panX -= 1;
      if (keys['ArrowRight'] || keys['KeyD']) panX += 1;
      
      if (keys['ShiftLeft'] || keys['ShiftRight']) panY = 0; // Prevent scrolling up/down if shift is pressed? No, let's keep it simple.
      
      const speed = (keys['ShiftLeft'] ? 30 : 15) * delta;

      if (panX !== 0 || panY !== 0) {
        const right = new THREE.Vector3();
        const up = new THREE.Vector3();
        const forward = new THREE.Vector3();
        state.camera.matrix.extractBasis(right, up, forward);
        
        const panVector = new THREE.Vector3();
        panVector.addScaledVector(right, panX);
        panVector.addScaledVector(up, panY);
        
        panVector.normalize().multiplyScalar(speed);
        state.camera.position.add(panVector);
        controlsRef.current.target.add(panVector);
      }
      
      // Zoom with Q/E
      let zoom = 0;
      if (keys['KeyQ']) zoom -= 1;
      if (keys['KeyE']) zoom += 1;
      
      if (zoom !== 0) {
        const forward = new THREE.Vector3();
        state.camera.getWorldDirection(forward);
        
        const zoomVector = new THREE.Vector3();
        zoomVector.addScaledVector(forward, zoom * speed);
        
        state.camera.position.add(zoomVector);
        controlsRef.current.target.add(zoomVector);
      }
    }
    
    controlsRef.current.update();
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      zoomSpeed={0.1}
      maxDistance={100} 
      minDistance={1} 
      autoRotate={!isPlaying && viewMode === 'single' && !lockViewpoint && !resetViewFlag} 
      autoRotateSpeed={0.2} 
      makeDefault
    />
  );
}

export default function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(3500);
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  const [tab, setTab] = useState<'simulation' | 'differential' | 'integral'>('simulation');
  const [isContextMinimized, setIsContextMinimized] = useState(false);
  const [lockViewpoint, setLockViewpoint] = useState(false);
  const [resetViewFlag, setResetViewFlag] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [rounds, setRounds] = useState<number>(5);
  const [plaintext, setPlaintext] = useState<State>(unflatten([0x3, 0xB, 0x5, 0xC, 0x7, 0x7, 0xA, 0x4, 0x9, 0x2, 0x1, 0xF, 0x9, 0x7, 0x1, 0x8]));
  const [key0, setKey0]           = useState<State>(unflatten([0x9, 0x2, 0xF, 0x0, 0x9, 0x9, 0x5, 0x2, 0xC, 0x6, 0x2, 0x5, 0xE, 0x3, 0xE, 0x9]));
  const [key1, setKey1]           = useState<State>(unflatten([0xD, 0x7, 0xA, 0x0, 0x6, 0x0, 0xF, 0x7, 0x1, 0x4, 0xC, 0x0, 0x2, 0x9, 0x2, 0xB]));
  const [tweak, setTweak]         = useState<State>(unflatten([0xB, 0xA, 0x9, 0x1, 0x2, 0xE, 0x6, 0xF, 0x1, 0x0, 0x5, 0x5, 0xF, 0xE, 0xD, 0x2]));

  const [operation, setOperation] = useState<'encrypt' | 'decrypt'>('encrypt');
  
  const history = useMemo(() => {
    if (operation === 'encrypt') {
      return mantisCipher(plaintext, key0, key1, tweak, rounds);
    } else {
      return mantisCipher(plaintext, key0, key1, tweak, rounds, true);
    }
  }, [plaintext, key0, key1, tweak, rounds, operation]);

  const { cellPositionsMap, tweakPositionsMap } = useMemo(() => {
    if (!history || history.length === 0) return { cellPositionsMap: [], tweakPositionsMap: [] };
    const cellResult: number[][] = [];
    const tweakResult: number[][] = [];

    let currentCellPos = Array.from({ length: 16 }, (_, i) => i);
    let currentCellIndexToId = Array.from({ length: 16 }, (_, i) => i);

    let currentTweakPos = Array.from({ length: 16 }, (_, i) => i);
    let currentTweakIndexToId = Array.from({ length: 16 }, (_, i) => i);
    
    for (let s = 0; s < history.length; s++) {
      const step = history[s];
      const pos = [...currentCellPos];
      const tPos = [...currentTweakPos];
      
      if (s > 0) {
        // Tweak permutation actually changes the tweak array at certain steps
        // we can detect it by comparing step.tweak with previous.
        const prevStep = history[s - 1];
        if (JSON.stringify(step.tweak) !== JSON.stringify(prevStep.tweak)) {
          const nextTweakIndexToId = new Array(16);
          for (let i = 0; i < 16; i++) {
            const fromIndex = H_PERM[i];
            const id = currentTweakIndexToId[fromIndex];
            tPos[id] = i;
            nextTweakIndexToId[i] = id;
          }
          currentTweakPos = tPos;
          currentTweakIndexToId = nextTweakIndexToId;
        }
      }

      if (step.type === 'shuffle_cells') {
        const isInverse = step.name.includes("Inv");
        const p = isInverse ? SHUFFLE_INV : SHUFFLE;
        const nextIndexToId = new Array(16);
        for (let i = 0; i < 16; i++) {
          const fromIndex = p[i];
          const id = currentCellIndexToId[fromIndex];
          pos[id] = i;
          nextIndexToId[i] = id;
        }
        currentCellPos = pos;
        currentCellIndexToId = nextIndexToId;
      }
      cellResult.push(pos);
      tweakResult.push(tPos);
    }
    return { cellPositionsMap: cellResult, tweakPositionsMap: tweakResult };
  }, [history]);

  useEffect(() => {
    // Confetti removed
  }, [stepIndex, history.length, isPlaying]);

  const currentStep = history[stepIndex] || history[0];
  const previousStep = history[stepIndex - 1];

  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setStepIndex((prev) => {
          if (prev >= history.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed, history.length]);

  const randomize = () => {
    const r = () => Math.floor(Math.random() * 16);
    setPlaintext(unflatten(Array.from({ length: 16 }, r)));
    setKey0(unflatten(Array.from({ length: 16 }, r)));
    setKey1(unflatten(Array.from({ length: 16 }, r)));
    setTweak(unflatten(Array.from({ length: 16 }, r)));
    setStepIndex(0);
    setIsPlaying(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0c0d0f] text-[#d1d5db] font-sans overflow-hidden selections:bg-cyan-500/30">
      {/* Header */}
      <header className="h-14 border-b border-[#2a2d35] flex items-center justify-between px-6 bg-[#15171d] z-50 shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse"></div>
          <h1 className="text-lg font-bold tracking-tight text-white uppercase flex flex-col justify-center">
            <div className="flex items-center gap-2">
              MANTIS-{rounds} <span className="text-cyan-400 font-mono text-sm font-normal opacity-70 whitespace-nowrap">BLOCK CIPHER SIMULATOR</span>
            </div>
            <span className="text-[10px] text-cyan-100 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] tracking-wider font-mono hidden sm:block">CSL505 Cryptography - Indian Institute of Technology Bhilai, Winter 2026</span>
          </h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setTab('simulation')}
            className={cn("px-4 py-2 text-xs font-bold uppercase rounded", tab === 'simulation' ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50" : "text-gray-500 hover:text-gray-300")}
          >
            Simulation
          </button>
          <button 
            onClick={() => setTab('differential')}
            className={cn("px-4 py-2 text-xs font-bold uppercase rounded", tab === 'differential' ? "bg-purple-500/20 text-purple-400 border border-purple-500/50" : "text-gray-500 hover:text-gray-300")}
          >
            Differential Attack
          </button>
          <button 
            onClick={() => setTab('integral')}
            className={cn("px-4 py-2 text-xs font-bold uppercase rounded", tab === 'integral' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50" : "text-gray-500 hover:text-gray-300")}
          >
            Integral Attack
          </button>
        </div>

        <div className="hidden md:flex items-center space-x-8 text-[11px] font-mono text-[#9ca3af]">
          <div className="flex flex-col">
            <span className="text-[#6b7280]">MODE</span>
            <span className="text-amber-400 uppercase">{operation}</span>
          </div>
          <div className="flex flex-col border-l border-[#2a2d35] pl-8">
            <span className="text-[#6b7280]">BLOCK SIZE</span>
            <span>64-BIT</span>
          </div>
          <div className="flex flex-col border-l border-[#2a2d35] pl-8">
            <span className="text-[#6b7280]">ROUNDS</span>
            <span>{rounds * 2} ({rounds}-F-{rounds})</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {tab === 'simulation' && (
          <>
            {/* Left Control Center (Input Parameters) */}
            <aside className="w-72 border-r border-[#2a2d35] bg-[#111318] p-4 flex flex-col space-y-6 z-40 overflow-y-auto">
          <section>
            <h2 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center justify-between">
              Input Vector
              <button 
                onClick={() => {
                  if (history && history.length > 0) {
                    const lastState = history[history.length - 1].state;
                    setPlaintext(lastState);
                  }
                  setOperation(o => o === 'encrypt' ? 'decrypt' : 'encrypt');
                  setStepIndex(0);
                }}
                className="text-[9px] bg-[#1e2229] hover:bg-[#2a2d35] px-2 py-1 rounded transition-colors text-white"
                title="Toggle Mode"
              >
                <RefreshCw size={10} className="inline mr-1"/>
                SWAP
              </button>
            </h2>

            <div className="flex flex-col gap-2 mb-4 bg-[#090a0c] p-2 rounded border border-[#374151]">
              <div className="text-[10px] text-gray-500 font-bold uppercase">Quick Test Vectors</div>
              <div className="flex gap-2">
                {[5, 6, 7, 8].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      const k0Str = "92f09952c625e3e9";
                      const k1Str = "d7a060f714c0292b";
                      const tweakStr = "ba912e6f1055fed2";
                      
                      const vectors: Record<number, string> = {
                        5: "3b5c77a4921f9718",
                        6: "d6522035c1c0c6c1",
                        7: "60e43457311936fd",
                        8: "308e8a07f168f517"
                      };
                      
                      setRounds(r);
                      setKey0(unflatten(k0Str.split('').map(x => parseInt(x, 16))));
                      setKey1(unflatten(k1Str.split('').map(x => parseInt(x, 16))));
                      setTweak(unflatten(tweakStr.split('').map(x => parseInt(x, 16))));
                      setPlaintext(unflatten(vectors[r].split('').map(x => parseInt(x, 16))));
                      setOperation('encrypt');
                      setStepIndex(0);
                      setIsPlaying(true);
                    }}
                    className="flex-1 bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-200 text-[9px] py-1 rounded transition-colors border border-cyan-800"
                  >
                    M-{r}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">ROUNDS</label>
                <select 
                  value={rounds} 
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="w-full bg-[#090a0c] border border-[#374151] p-1 font-mono text-[10px] text-white outline-none focus:border-cyan-500"
                >
                  <option value={5}>MANTIS-5</option>
                  <option value={6}>MANTIS-6</option>
                  <option value={7}>MANTIS-7</option>
                  <option value={8}>MANTIS-8</option>
                  <option value={9}>MANTIS-9</option>
                  <option value={12}>MANTIS-12</option>
                  <option value={26}>MANTIS-26</option>
                  <option value={27}>MANTIS-27</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">{operation === 'encrypt' ? 'PLAINTEXT (P)' : 'CIPHERTEXT (C)'}</label>
                <HexInput value={plaintext} onChange={(v) => setPlaintext(v)} className="text-white" />
              </div>
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">BASE KEY (K0)</label>
                <HexInput value={key0} onChange={(v) => setKey0(v)} className="text-white" />
              </div>
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">SECONDARY KEY (K1)</label>
                <HexInput value={key1} onChange={(v) => setKey1(v)} className="text-indigo-400" />
              </div>
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">TWEAK (T)</label>
                <HexInput value={tweak} onChange={(v) => setTweak(v)} className="text-amber-500" />
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 mt-2">Output Vector</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] text-[#6b7280] block mb-1">{operation === 'encrypt' ? 'CIPHERTEXT (C)' : 'PLAINTEXT (P)'}</label>
                <div className="bg-[#090a0c] border border-[#374151] p-2 font-mono text-[10px] text-emerald-400 break-all flex flex-wrap gap-0.5">
                  {flattenState(history[history.length - 1]?.state || plaintext).map(n => n.toString(16).toUpperCase())}
                </div>
              </div>
            </div>
          </section>

          <section className="flex-1">
            <h2 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3">Operation Stack</h2>
            <div className="space-y-1 font-mono text-[10px]">
              {history.map((step, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "flex items-center justify-between p-1.5 transition-colors cursor-pointer",
                    i < stepIndex ? "opacity-40" : "",
                    i === stepIndex ? "bg-cyan-900/30 text-cyan-200 border-l-2 border-cyan-500 px-2" : "hover:bg-white/5"
                  )}
                  onClick={() => setStepIndex(i)}
                >
                  <span className="truncate pr-2">{(i + 1).toString().padStart(2, '0')}. {step.name.toUpperCase()}</span>
                  <span className={cn("text-[8px] shrink-0", i === stepIndex ? "animate-pulse text-cyan-400" : "text-gray-500")}>
                    {i === stepIndex ? "ACTIVE" : i < stepIndex ? "DONE" : "WAIT"}
                  </span>
                </div>
              )).slice(Math.max(0, stepIndex - 4), stepIndex + 8)}
            </div>
          </section>

          <div className="mt-auto pt-4 border-t border-[#2a2d35]">
            <button 
              onClick={randomize}
              className="w-full bg-[#1e2229] border border-[#374151] py-2 rounded text-[10px] font-bold text-white hover:bg-[#2a2d35] flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3 h-3" /> RE-SEED VECTORS
            </button>
          </div>
        </aside>

        {/* 3D Visualization Area */}
        <div ref={containerRef} className="flex-1 bg-[#090a0c] relative flex flex-col overflow-hidden">
          <div className="absolute top-4 left-6 text-[11px] font-mono z-20 pointer-events-none">
            <div className="text-cyan-400">// ROUND_{currentStep.round} :: {stepIndex < history.length / 2 ? 'FORWARD_PASS' : 'BACKWARD_PASS'}</div>
            <div className="text-[#6b7280]">TRANSFORM: {currentStep.name}</div>
          </div>

          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, viewMode === 'compare' ? 1.5 : 0, viewMode === 'compare' ? 26 : 16]} fov={40} />
            <ambientLight intensity={0.2} />
            <spotLight position={[10, 20, 10]} angle={0.2} penumbra={1} intensity={1.5} castShadow color="#06b6d4" />
            <pointLight position={[-10, -5, -5]} intensity={0.5} color="#0891b2" />
            
            <Stars radius={100} depth={50} count={1000} factor={2} saturation={0} fade speed={0.5} />
            
            <Center>
              <group scale={0.8}>
                {viewMode === 'single' ? (
                  currentStep && (
                    <group>
                      <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
                        <MantisGrid 
                          state={currentStep.state} 
                          previousState={previousStep?.state}
                          label={currentStep.name.toUpperCase()} 
                          position={[0, 0, 0]} 
                          opType={currentStep.type}
                          stepIndex={stepIndex}
                          cellPositions={cellPositionsMap[stepIndex]}
                          speed={speed}
                        />
                      </Float>
                      {currentStep.roundTweakey && (
                        <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.15}>
                          <MantisGrid 
                            state={currentStep.roundTweakey}
                            previousState={(previousStep && JSON.stringify(previousStep.roundTweakey) !== JSON.stringify(currentStep.roundTweakey)) ? currentStep.tweak : currentStep.roundTweakey}
                            label={`SUB-TWEAKEY (STK_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}) : TWEAK \u2295 RK \u2295 RC`}
                            position={[0, 2, -6]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            opType="rt_update"
                            rtCombineValsList={flattenState(currentStep.roundTweakey).map((_, i) => ({
                              tweak: currentStep.tweak ? flattenState(currentStep.tweak)[i] : 0,
                              rk: currentStep.stepRk ? flattenState(currentStep.stepRk)[i] : 0,
                              rc: currentStep.stepRc ? flattenState(currentStep.stepRc)[i] : 0,
                            }))}
                          />
                        </Float>
                      )}
                      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.1}>
                        <MantisGrid 
                          state={currentStep.tweak}
                          label={`TWEAK h^${currentStep.name.match(/Round\s+(\d+)/)?.[1] || (currentStep.name.includes('Mid') ? currentStep.round : 0)}(T)`}
                          position={[0, 4, -12]}
                          stepIndex={stepIndex}
                          cellPositions={tweakPositionsMap[stepIndex]}
                          showValues={true}
                          speed={speed}
                          opType="tweak_shuffle"
                        />
                      </Float>
                      {currentStep.stepRc && (
                        <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.1}>
                          <MantisGrid 
                            state={currentStep.stepRc}
                            label={`ROUND CONST RC_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}`}
                            position={[7.5, 4, -12]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            scale={0.8}
                          />
                        </Float>
                      )}
                      {currentStep.stepRk && (
                        <Float speed={1.1} rotationIntensity={0.1} floatIntensity={0.1}>
                          <MantisGrid 
                            state={currentStep.stepRk}
                            label={`ROUND KEY RK_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}: ${currentStep.name.includes("'") ? 'K_1 \u2295 \u03b1' : 'K_1'}`}
                            position={[-7.5, 4, -12]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            scale={0.8}
                          />
                        </Float>
                      )}
                    </group>
                  )
                ) : (
                  <group>
                    <MantisGrid 
                      state={plaintext} 
                      label={operation === 'encrypt' ? "PLAINTEXT" : "CIPHERTEXT"} 
                      position={[-10.25, 0, 0]} 
                      stepIndex={0}
                      speed={speed}
                    />
                    {currentStep && (
                      <group>
                        <MantisGrid 
                          state={currentStep.state} 
                          previousState={previousStep?.state}
                          label="PROCESS" 
                          position={[0, 0, 0]} 
                          opType={currentStep.type}
                          stepIndex={stepIndex}
                          cellPositions={cellPositionsMap[stepIndex]}
                          speed={speed}
                        />
                        {currentStep.roundTweakey && (
                          <MantisGrid 
                            state={currentStep.roundTweakey}
                            previousState={(previousStep && JSON.stringify(previousStep.roundTweakey) !== JSON.stringify(currentStep.roundTweakey)) ? currentStep.tweak : currentStep.roundTweakey}
                            label={`SUB-TWEAKEY (STK_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}) : TWEAK \u2295 RK \u2295 RC`}
                            position={[0, 2, -6]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            opType="rt_update"
                            rtCombineValsList={flattenState(currentStep.roundTweakey).map((_, i) => ({
                              tweak: currentStep.tweak ? flattenState(currentStep.tweak)[i] : 0,
                              rk: currentStep.stepRk ? flattenState(currentStep.stepRk)[i] : 0,
                              rc: currentStep.stepRc ? flattenState(currentStep.stepRc)[i] : 0,
                            }))}
                          />
                        )}
                        <MantisGrid 
                          state={currentStep.tweak}
                          label={`TWEAK h^${currentStep.name.match(/Round\s+(\d+)/)?.[1] || (currentStep.name.includes('Mid') ? currentStep.round : 0)}(T)`}
                          position={[0, 4, -12]}
                          stepIndex={stepIndex}
                          cellPositions={tweakPositionsMap[stepIndex]}
                          showValues={true}
                          speed={speed}
                          opType="tweak_shuffle"
                        />
                        {currentStep.stepRc && (
                          <MantisGrid 
                            state={currentStep.stepRc}
                            label={`ROUND CONST RC_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}`}
                            position={[7.5, 4, -12]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            scale={0.8}
                          />
                        )}
                        {currentStep.stepRk && (
                          <MantisGrid 
                            state={currentStep.stepRk}
                            label={`ROUND KEY RK_${currentStep.name.match(/Round\s+(\d+)/)?.[1] || 0}: ${currentStep.name.includes("'") ? 'K_1 \u2295 \u03b1' : 'K_1'}`}
                            position={[-7.5, 4, -12]}
                            stepIndex={stepIndex}
                            showValues={true}
                            speed={speed}
                            scale={0.8}
                          />
                        )}
                      </group>
                    )}
                    {history && history.length > 0 && (
                      <MantisGrid 
                        state={history[history.length - 1].state} 
                        label={operation === 'encrypt' ? "CIPHERTEXT" : "PLAINTEXT"} 
                        position={[10.25, 0, 0]} 
                        showValues={stepIndex === history.length - 1}
                        stepIndex={history.length - 1}
                        speed={speed}
                      />
                    )}
                  </group>
                )}
              </group>
            </Center>
            
            <CameraManager
              viewMode={viewMode}
              isPlaying={isPlaying}
              lockViewpoint={lockViewpoint}
              resetViewFlag={resetViewFlag}
              onResetDone={() => setResetViewFlag(false)}
            />
          </Canvas>

          {/* Camera Controls */}
          <div className="absolute bottom-4 left-6 z-20 flex gap-2">
            <button 
              onClick={() => setLockViewpoint(!lockViewpoint)}
              className={cn("px-3 py-1.5 rounded text-[10px] font-bold border transition-colors flex items-center gap-2", lockViewpoint ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "bg-[#1e2229] border-[#374151] text-gray-300 hover:bg-[#2a2d35]")}
            >
              {lockViewpoint ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {lockViewpoint ? 'VIEW LOCKED' : 'LOCK VIEW'}
            </button>
            <button
              onClick={() => setResetViewFlag(true)}
              className="px-3 py-1.5 rounded text-[10px] font-bold bg-[#1e2229] border border-[#374151] text-gray-300 hover:bg-[#2a2d35] flex items-center gap-2 transition-colors"
            >
              <Locate className="w-3 h-3" />
              RESET VIEW
            </button>
          </div>

          {/* Floating UI Elements */}
          <motion.div 
            drag
            dragConstraints={containerRef}
            dragMomentum={false}
            className="absolute top-6 right-6 w-48 bg-[#15171d] border border-[#374151] p-3 rounded shadow-2xl z-20 pointer-events-auto cursor-move shadow-black/50"
          >
            <div className="text-[9px] uppercase text-[#6b7280] font-bold tracking-widest mb-2 flex items-center justify-between">
              <span>Step Context</span>
              <div className="flex items-center gap-1">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setIsContextMinimized(!isContextMinimized)}
                  className="text-[#6b7280] hover:text-white"
                >
                  {isContextMinimized ? <Maximize2 className="w-3 h-3 cursor-pointer" /> : <Minimize2 className="w-3 h-3 cursor-pointer" />}
                </button>
                <span className="text-[#374151] cursor-grab active:cursor-grabbing ml-1">⋮⋮</span>
              </div>
            </div>
            
            {!isContextMinimized && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]"><span className="text-[#6b7280]">TYPE:</span> <span className="text-white font-mono uppercase">{currentStep.type.replace('_', ' ')}</span></div>
                  <div className="flex justify-between text-[10px]"><span className="text-[#6b7280]">ROUND:</span> <span className="text-cyan-400 font-mono">{currentStep.round}</span></div>
                </div>
                <div className="mt-3 pt-3 border-t border-[#2a2d35]">
                  <div className="text-[9px] uppercase text-[#6b7280] font-bold tracking-widest mb-1 mt-1">Operation Detail</div>
                  <div className="text-[10px] text-[#94a3b8] leading-relaxed mb-3">
                    {getOperationDetail(currentStep.type, currentStep.name)}
                  </div>
                  <div className="w-full bg-[#090a0c] h-1 rounded overflow-hidden">
                    <div 
                      className="bg-cyan-500 h-full transition-all duration-300" 
                      style={{ width: `${((stepIndex + 1) / history.length) * 100}%` }}
                    />
                  </div>
                  <div className="text-[8px] mt-1 text-[#6b7280]">PROGRESS: {Math.round(((stepIndex + 1) / history.length) * 100)}%</div>
                </div>
              </>
            )}
          </motion.div>
        </div>

        {/* Sidebar Right: Analytics & Reference */}
        <aside className="hidden lg:flex w-64 border-l border-[#2a2d35] bg-[#111318] p-4 flex-col z-40">
          <h2 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">Cipher Reference</h2>
          
          <div className="flex-1 space-y-6 overflow-hidden overflow-y-auto">
            {currentStep.type === 'mix_columns' ? (
              <div>
                <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">MixColumns Matrix M</h3>
                <div className="bg-[#1e2229] p-2 border border-[#2a2d35] rounded font-mono text-[10px] text-white/80 leading-relaxed text-center">
                  <div>[ 0 1 1 1 ]   [ c0 ]</div>
                  <div>[ 1 0 1 1 ] × [ c1 ]</div>
                  <div>[ 1 1 0 1 ]   [ c2 ]</div>
                  <div>[ 1 1 1 0 ]   [ c3 ]</div>
                </div>
                <p className="text-[8px] text-[#6b7280] mt-2">M is applied via Galois field arithmetic to each matrix column.</p>
              </div>
            ) : currentStep.type === 'sub_cells' ? (
               <div>
                  <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">4-bit S-Box</h3>
                  <div className="grid grid-cols-4 gap-1">
                    {[0xc, 0xa, 0xd, 0x3, 0xe, 0xb, 0xf, 0x7, 0x8, 0x9, 0x1, 0x5, 0x0, 0x2, 0x4, 0x6].map((v, i) => (
                      <div key={i} className="bg-[#1e2229] p-1 text-[9px] font-mono text-center border border-[#2a2d35] text-white/70">
                        {i.toString(16).toUpperCase()}→{v.toString(16).toUpperCase()}
                      </div>
                    ))}
                  </div>
               </div>
            ) : currentStep.type === 'shuffle_cells' ? (
              <div>
                <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">Permutation P</h3>
                <div className="grid grid-cols-4 gap-1">
                  {SHUFFLE.map((v, i) => (
                    <div key={i} className="bg-[#1e2229] p-1 text-[9px] font-mono text-center border border-[#2a2d35] text-white/70">
                      p_{i} → {v}
                    </div>
                  ))}
                </div>
              </div>
            ) : currentStep.type === 'add_tweakey' ? (
              <div>
                <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">SubTweakey Generation</h3>
                <div className="bg-[#1e2229] py-2 px-3 flex flex-col gap-2 border border-[#2a2d35] rounded font-mono text-[10px] text-white/80 leading-relaxed overflow-x-auto whitespace-nowrap mb-3">
                  <div className="text-center font-bold text-[11px] mb-1 text-white">S' = S ⊕ SubTweakey</div>
                  <div className="text-center text-cyan-400 mb-2 border-b border-[#2a2d35] pb-3 text-[11px]">SubTweakey = h^r(T) ⊕ RK_r ⊕ RC_r</div>
                  
                  <div className="px-2 py-1.5 bg-[#090a0c] rounded text-[9px] text-[#94a3b8] flex flex-col gap-1 w-full max-w-full whitespace-normal">
                    <div><span className="text-amber-500 font-bold">⊕</span> : Bitwise XOR (Exclusive OR)</div>
                    <div><span className="text-cyan-300 font-bold">S</span> : State (Current working matrix)</div>
                    <div><span className="text-cyan-300 font-bold">h^r(T)</span> : Tweak Matrix after applying permutation <span className="italic">h()</span> <span className="italic">r</span> times</div>
                    <div><span className="text-cyan-300 font-bold">RK_r</span> : Round Key matrix (derived directly from K1 or K1 ⊕ α)</div>
                    <div><span className="text-cyan-300 font-bold">RC_r</span> : Fixed Round Constant from fractional digits of pi</div>
                  </div>

                  {currentStep.round > 0 && currentStep.round <= history.length && !currentStep.name.includes('Initial') && !currentStep.name.includes('Final') && (
                     <div className="mt-3 px-2 py-1.5 bg-[#2a2d35]/30 border border-[#374151] rounded flex flex-col gap-3">
                        <div className="text-center font-bold text-cyan-400 text-[10px] border-b border-[#2a2d35] pb-1">
                          Round Constants and Round Keys
                        </div>
                        <div className="text-[9px] text-white/80">
                          <div className="font-bold text-white mb-1"><span className="text-cyan-300">RC_r</span> : 64-bit Fixed Constant</div>
                          <div className="text-[8px] text-[#94a3b8] whitespace-normal leading-relaxed">
                            MANTIS uses fixed round constants derived from the fractional digits of pi. They do not change based on user keys or tweaks.
                          </div>
                        </div>
                        <div className="text-[9px] text-white/80">
                          <div className="font-bold text-white mb-1"><span className="text-cyan-300">RK_r</span> = {currentStep.name.includes("'") ? "K_1 \u2295 \u03b1" : "K_1"}</div>
                          <div className="text-[8px] text-[#94a3b8] whitespace-normal leading-relaxed">
                            The secondary key K1 is used as-is in the forward rounds. In the backward rounds, it is XORed with a fixed constant alpha to prevent related-key attacks.
                          </div>
                        </div>
                     </div>
                  )}

                  {currentStep.stepRc && currentStep.stepRk && currentStep.tweak && currentStep.roundTweakey && (
                    <div className="text-[9px] text-white/50 border-t border-[#2a2d35] pt-2 mt-1">
                       <div className="grid grid-cols-4 gap-1">
                         {flattenState(currentStep.roundTweakey).map((stk, i) => (
                           <div key={i} className="flex flex-col items-center justify-center py-1.5 px-1 bg-[#2a2d35]/30 border border-[#374151] rounded">
                             <div className="text-[#6b7280] text-[7px] mb-1 uppercase tracking-wider">Cell {i}</div>
                             <div className="tracking-widest flex items-center gap-0.5">
                               <span>{flattenState(currentStep.tweak!)[i].toString(16).toUpperCase()}</span>
                               <span className="text-[7px] text-[#6b7280]">⊕</span>
                               <span>{flattenState(currentStep.stepRk!)[i].toString(16).toUpperCase()}</span>
                               <span className="text-[7px] text-[#6b7280]">⊕</span>
                               <span>{flattenState(currentStep.stepRc!)[i].toString(16).toUpperCase()}</span>
                             </div>
                             <div className="text-amber-500/80 mt-0.5 font-bold">
                               = {stk.toString(16).toUpperCase()}
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}
                  <div className="mt-1 text-amber-500/80 text-[8px] whitespace-normal">Each cell displays ⊕ [Value] to indicate the SubTweakey being XORed.</div>
                </div>
                <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">Tweak Permutation h</h3>
                <div className="grid grid-cols-4 gap-1">
                  {H_PERM.map((v, i) => (
                    <div key={i} className="bg-[#1e2229] p-1 text-[9px] font-mono text-center border border-[#2a2d35] text-white/70">
                      p_{i} → {v}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
               <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded">
                 <h3 className="text-[10px] text-amber-500 font-bold mb-1">MANTIS CIPHER</h3>
                 <p className="text-[9px] text-[#9ca3af] leading-relaxed">MANTIS is designed for low-latency hardware. Ensure Tweak (T) is fresh per session.</p>
               </div>
            )}

            <div className="pt-4 overflow-hidden">
              <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">Entropy Density</h3>
              <div className="flex items-end space-x-[2px] h-16 bg-[#090a0c] p-2 rounded border border-[#2a2d35]">
                {currentStep?.state ? flattenState(currentStep.state).map((v, i) => (
                  <div 
                    key={i} 
                    className="flex-1 bg-cyan-600/40 border-t-2 border-cyan-400" 
                    style={{ height: `${(v / 15) * 100}%` }}
                  />
                )) : null}
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-2">
            <div className="flex bg-[#1e2229] p-1 rounded border border-[#374151]">
              <button 
                onClick={() => setViewMode('single')}
                className={cn("flex-1 py-1 rounded text-[9px] font-bold transition-all", viewMode === 'single' ? "bg-white text-black" : "text-white/40")}
              >
                FOCUS
              </button>
              <button 
                onClick={() => setViewMode('compare')}
                className={cn("flex-1 py-1 rounded text-[9px] font-bold transition-all", viewMode === 'compare' ? "bg-white text-black" : "text-white/40")}
              >
                FLOW
              </button>
            </div>
          </div>
        </aside>
          </>
        )}

        {tab === 'differential' && (
          <div className="flex-1 flex overflow-hidden">
             <DifferentialAttackTab />
          </div>
        )}

        {tab === 'integral' && (
          <div className="flex-1 flex overflow-hidden">
             <IntegralAttackTab />
          </div>
        )}
      </main>

      {/* Timeline & Controls Footer */}
      {tab === 'simulation' && (
      <footer className="h-24 border-t border-[#2a2d35] bg-[#15171d] px-6 flex items-center space-x-8 z-50">
        <div className="flex items-center gap-2">
           <div className="flex items-center bg-white/5 p-1 rounded border border-white/5">
             <button 
              onClick={() => { setOperation('encrypt'); setStepIndex(0); }}
              className={cn("px-3 py-1 rounded text-[10px] font-bold transition-all", operation === 'encrypt' ? "bg-cyan-600 text-white shadow-lg" : "text-white/40 hover:text-white")}
            >
              ENC
            </button>
            <button 
              onClick={() => { setOperation('decrypt'); setStepIndex(0); }}
              className={cn("px-3 py-1 rounded text-[10px] font-bold transition-all", operation === 'decrypt' ? "bg-cyan-600 text-white shadow-lg" : "text-white/40 hover:text-white")}
            >
              DEC
            </button>
           </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
            className="w-10 h-10 rounded-full border border-[#374151] flex items-center justify-center hover:bg-[#1e2229] text-white transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-12 h-12 rounded-full bg-cyan-600 flex items-center justify-center hover:bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)] text-white transition-all transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
          </button>
          <button 
            onClick={() => setStepIndex(Math.min(history.length - 1, stepIndex + 1))}
            className="w-10 h-10 rounded-full border border-[#374151] flex items-center justify-center hover:bg-[#1e2229] text-white transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Timeline Slider */}
        <div className="flex-1">
          <div className="flex justify-between text-[10px] text-[#6b7280] font-mono mb-2 uppercase tracking-wider">
            <span>START</span>
            <span className="text-cyan-400">{currentStep.name.toUpperCase()} :: {stepIndex + 1}/{history.length}</span>
            <span>END</span>
          </div>
          <div className="relative h-6 flex items-center group">
            {/* Track */}
            <div className="absolute w-full h-[2px] bg-[#2a2d35]"></div>
            {/* Progress */}
            <div 
              className="absolute h-[2px] bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" 
              style={{ width: `${(stepIndex / (history.length - 1)) * 100}%` }}
            ></div>
            {/* Input Slider (Hidden but interactive) */}
            <input 
              type="range"
              min="0"
              max={history.length - 1}
              value={stepIndex}
              onChange={(e) => setStepIndex(parseInt(e.target.value))}
              className="absolute w-full h-full opacity-0 cursor-pointer z-10"
            />
            {/* Markers */}
            <div className="absolute w-full flex justify-between px-[1px] pointer-events-none">
              {Array.from({length: 15}).map((_, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "w-[1px] h-2 transition-colors",
                    (i / 14) <= (stepIndex / (history.length - 1)) ? "bg-cyan-500" : "bg-[#374151]"
                  )} 
                />
              ))}
            </div>
            {/* Handle */}
            <div 
              className="absolute w-4 h-4 bg-white border-2 border-cyan-500 rounded-full shadow-[0_0_10px_white] pointer-events-none z-20"
              style={{ left: `calc(${(stepIndex / (history.length - 1)) * 100}% - 8px)` }}
            ></div>
          </div>
        </div>

        {/* Speed/Settings */}
        <div className="w-40">
           <label className="text-[9px] text-[#6b7280] uppercase block mb-1 tracking-widest font-bold">Playback Rate</label>
           <div className="flex items-center space-x-2">
             <span className="text-[10px] font-mono text-cyan-400/50">SLOW</span>
             <select 
                value={speed}
                onChange={(e) => setSpeed(parseInt(e.target.value))}
                className="flex-1 bg-transparent border-b border-[#374151] py-1 text-[10px] font-mono text-white outline-none focus:border-cyan-500"
              >
                <option value={4000} className="bg-[#15171d]">0.5x</option>
                <option value={2500} className="bg-[#15171d]">1.0x</option>
                <option value={1200} className="bg-[#15171d]">2.0x</option>
                <option value={600} className="bg-[#15171d]">4.0x</option>
              </select>
             <span className="text-[10px] font-mono text-cyan-400">FAST</span>
           </div>
        </div>
      </footer>
      )}
      {/* VFX: Ambient Background Dust */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-cyan-500/5 blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="h-6 shrink-0 flex items-center justify-center bg-[#0c0d0f] text-[9px] text-[#6b7280] border-t border-[#2a2d35] z-50 w-full text-center px-4">
        CSL505 Cryptography - Indian Institute of Technology Bhilai, Winter 2026. Professor Dr. Dhiman Saha IIT Bhilai; Simulation By Swarnadip Kar - IIT Bhilai BTech CSE 2027 Batch
      </div>
    </div>
  );
}
