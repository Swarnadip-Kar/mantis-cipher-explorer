import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Float, Stars, Center, Bounds } from '@react-three/drei';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, SkipBack, SkipForward, Info, Lock, Key, Hash, RefreshCw, Layers, Cpu, Box } from 'lucide-react';
import confetti from 'canvas-confetti';
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
import { SHUFFLE, SHUFFLE_INV } from './lib/mantis';

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
}

function AnimatedCell({ id, value, targetPos, scale = 1, isChanging, opType, stepIndex, showValues = true, xorVal, prevValue }: AnimatedCellProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const color = showValues ? NIBBLE_COLORS[displayValue % 16] : '#1e293b';
  
  // Use the passed targetPos directly as the initial position array to avoid R3F recreating or assigning Vector3 objects
  const [initPos] = useState<[number, number, number]>(() => [...targetPos] as [number, number, number]);
  const [stepStartTime, setStepStartTime] = useState(Date.now());

  useEffect(() => {
    setStepStartTime(Date.now());
    
    let timer: any;
    if (isChanging && (opType === 'sub_cells' || opType === 'mix_columns' || opType === 'add_tweakey')) {
      setDisplayValue(prevValue !== undefined ? prevValue : value);
      timer = setTimeout(() => {
        setDisplayValue(value);
      }, 400); // 400ms delay to change value mid-animation
    } else {
      setDisplayValue(value);
    }
    
    return () => clearTimeout(timer);
  }, [stepIndex, value, prevValue, isChanging, opType]);

  useFrame((state, delta) => {
    if (groupRef.current) {
      const dampFactor = opType === 'shuffle_cells' ? 1.0 : 4;
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, targetPos[0], dampFactor, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetPos[1], dampFactor, delta);
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, targetPos[2], dampFactor, delta);

      const isMoving = opType === 'shuffle_cells';
      // In shuffle_cells, jumping scale is distracting, so we don't scale up on movement, just on data change
      const targetScale = (isChanging && !isMoving) ? 1.05 * scale : 1.0 * scale;
      groupRef.current.scale.setScalar(THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 8, delta));
    }
    
    if (meshRef.current) {
      const t = (Date.now() - stepStartTime) / 1000;
      if (opType === 'sub_cells' && isChanging) {
        if (t < 0.8) {
          const intensity = Math.max(0, 1 - (t / 0.8));
          meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 40) * 0.1 * intensity;
          meshRef.current.position.x = Math.sin(state.clock.elapsedTime * 50) * 0.05 * intensity;
        } else {
          meshRef.current.rotation.z = THREE.MathUtils.damp(meshRef.current.rotation.z, 0, 10, delta);
          meshRef.current.position.x = THREE.MathUtils.damp(meshRef.current.position.x, 0, 10, delta);
        }
      } else if (opType === 'mix_columns' && isChanging) {
        if (t < 0.8) {
          meshRef.current.rotation.y = Math.min(1, t / 0.8) * Math.PI * 2;
        } else {
          meshRef.current.rotation.y = 0;
        }
      } else {
        meshRef.current.rotation.z = THREE.MathUtils.damp(meshRef.current.rotation.z, 0, 10, delta);
        if (meshRef.current.rotation.y > 0) {
          meshRef.current.rotation.y = 0;
        }
        meshRef.current.position.x = THREE.MathUtils.damp(meshRef.current.position.x, 0, 10, delta);
      }
    }
  });

  let emissiveColor = '#000000';
  let emissiveIntensity = 0;
  if (isChanging || opType === 'shuffle_cells') {
    if (opType === 'mix_columns') {
      emissiveColor = '#06b6d4';
      emissiveIntensity = 0.8;
    } else if (opType === 'add_tweakey') {
      emissiveColor = '#f59e0b';
      emissiveIntensity = 0.8;
    } else if (opType === 'sub_cells') {
      emissiveColor = color;
      emissiveIntensity = 0.6;
    } else if (opType === 'shuffle_cells') {
      emissiveColor = color;
      emissiveIntensity = 0.3;
    } else {
      emissiveColor = color;
      emissiveIntensity = 0.5;
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
        {opType === 'add_tweakey' && xorVal !== undefined && isChanging ? (
           <Text
             position={[0, 0.6, 0.4]}
             fontSize={0.25}
             color="#f59e0b"
             anchorX="center"
             anchorY="middle"
           >
             ⊕ {xorVal.toString(16).toUpperCase()}
           </Text>
        ) : null}
        {opType === 'mix_columns' && isChanging ? (
           <Text
             position={[0, -0.6, 0.4]}
             fontSize={0.18}
             color="#06b6d4"
             anchorX="center"
             anchorY="middle"
           >
             M × Col
           </Text>
        ) : null}
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
  showValues = true 
}: { 
  state: State; 
  previousState?: State;
  label: string; 
  position: [number, number, number];
  opType?: string;
  stepIndex: number;
  cellPositions?: number[];
  showValues?: boolean;
}) {
  const flatState = flattenState(state);
  const prevFlatState = previousState ? flattenState(previousState) : null;

  return (
    <group position={position}>
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
        
        // For shuffle_cells, the logical value at this grid index changed to a new one.
        // Wait, for AnimatedCell to show the value changing for a FIXED cell:
        // isChanging is based on if the value it's displaying is different.
        // Actually, during mix_columns or add_tweakey, the cell stays in place and changes value.
        // During shuffle_cells, the cell moves, its value inside it DOES NOT CHANGE.
        // Well wait! "val" is the value currently at posIndex in "state".
        // The physical cell `id` moved to `posIndex`. Does its inherent value change? NO.
        // Because `shuffle_cells` only moves values.
        // So isChanging = false for the value itself.
        const isChanging = prevFlatState ? (prevFlatState[posIndex] !== val) : false;
        const xorVal = prevFlatState ? (val ^ prevFlatState[posIndex]) : undefined;

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
            isChanging={isChanging || opType === 'shuffle_cells'}
            showValues={showValues}
            xorVal={xorVal}
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
    case 'sub_cells': return "Applying non-linear substitution using a 4-bit S-Box. Each nibble is mapped to a new value to provide confusion.";
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

export default function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(3500);
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');
  
  const [plaintext, setPlaintext] = useState<State>(unflatten([0x5, 0xA, 0x3, 0x9, 0xC, 0xF, 0x1, 0x8, 0x4, 0x7, 0x2, 0xB, 0xE, 0x0, 0x6, 0xD]));
  const [key0, setKey0] = useState<State>(unflatten([0x2, 0x4, 0x3, 0xF, 0x6, 0xA, 0x8, 0x8, 0x8, 0x5, 0xA, 0x3, 0x0, 0x8, 0xD, 0x3]));
  const [key1, setKey1] = useState<State>(unflatten([0x1, 0x3, 0x1, 0x9, 0x8, 0xA, 0x2, 0xE, 0x0, 0x3, 0x7, 0x0, 0x7, 0x3, 0x4, 0x4]));
  const [tweak, setTweak] = useState<State>(unflatten([0x7, 0x1, 0x7, 0xA, 0xA, 0xC, 0x4, 0x2, 0xD, 0x2, 0xF, 0xC, 0x9, 0xB, 0x1, 0x2]));

  const [operation, setOperation] = useState<'encrypt' | 'decrypt'>('encrypt');
  
  const history = useMemo(() => {
    if (operation === 'encrypt') {
      return mantisCipher(plaintext, key0, key1, tweak, 7);
    } else {
      return mantisCipher(plaintext, key0, key1, tweak, 7, true);
    }
  }, [plaintext, key0, key1, tweak, operation]);

  const cellPositionsMap = useMemo(() => {
    if (!history || history.length === 0) return [];
    const result: number[][] = [];
    let currentPos = Array.from({ length: 16 }, (_, i) => i);
    let currentIndexToId = Array.from({ length: 16 }, (_, i) => i);
    
    for (let s = 0; s < history.length; s++) {
      const step = history[s];
      const pos = [...currentPos];
      
      if (step.type === 'shuffle_cells') {
        const isInverse = step.name.includes("Inv");
        const p = isInverse ? SHUFFLE_INV : SHUFFLE;
        const nextIndexToId = new Array(16);
        for (let i = 0; i < 16; i++) {
          const id = currentIndexToId[i];
          const nextIndex = p[i];
          pos[id] = nextIndex;
          nextIndexToId[nextIndex] = id;
        }
        currentPos = pos;
        currentIndexToId = nextIndexToId;
      }
      result.push(pos);
    }
    return result;
  }, [history]);

  useEffect(() => {
    if (stepIndex === history.length - 1 && isPlaying) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: NIBBLE_COLORS,
      });
    }
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
          <h1 className="text-lg font-bold tracking-tight text-white uppercase flex items-center gap-2">
            MANTIS-7 <span className="text-cyan-400 font-mono text-sm font-normal opacity-70 whitespace-nowrap">BLOCK CIPHER SIMULATOR</span>
          </h1>
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
            <span>14 (7-F-7)</span>
          </div>
          <div className="px-3 py-1 bg-[#1e2229] border border-[#374151] rounded text-white text-[10px]">v1.2.4-STABLE</div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Control Center (Input Parameters) */}
        <aside className="w-72 border-r border-[#2a2d35] bg-[#111318] p-4 flex flex-col space-y-6 z-40 overflow-y-auto">
          <section>
            <h2 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-3">Input Vector</h2>
            <div className="space-y-4">
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
        <div className="flex-1 bg-[#090a0c] relative flex flex-col overflow-hidden">
          <div className="absolute top-4 left-6 text-[11px] font-mono z-20 pointer-events-none">
            <div className="text-cyan-400">// ROUND_{currentStep.round} :: {stepIndex < history.length / 2 ? 'FORWARD_PASS' : 'BACKWARD_PASS'}</div>
            <div className="text-[#6b7280]">TRANSFORM: {currentStep.name}</div>
          </div>

          <Canvas shadows dpr={[1, 2]}>
            <PerspectiveCamera makeDefault position={[0, viewMode === 'compare' ? 1.5 : 0, viewMode === 'compare' ? 22 : 12]} fov={40} />
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
                          position={[-2.25, 0, 0]} 
                          opType={currentStep.type}
                          stepIndex={stepIndex}
                          cellPositions={cellPositionsMap[stepIndex]}
                        />
                      </Float>
                      {currentStep.roundTweakey && (
                        <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.15}>
                          <MantisGrid 
                            state={currentStep.roundTweakey}
                            previousState={previousStep?.roundTweakey}
                            label="SUB-TWEAKEY (RT)"
                            position={[-1.8, 1.5, -6]}
                            stepIndex={stepIndex}
                            showValues={true}
                          />
                        </Float>
                      )}
                      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.1}>
                        <MantisGrid 
                          state={currentStep.tweak}
                          label="TWEAK PERMUTATION (T)"
                          position={[-1.5, 3, -12]}
                          stepIndex={stepIndex}
                          showValues={true}
                        />
                      </Float>
                    </group>
                  )
                ) : (
                  <group>
                    <MantisGrid 
                      state={plaintext} 
                      label={operation === 'encrypt' ? "PLAINTEXT" : "CIPHERTEXT"} 
                      position={[-10.25, 0, 0]} 
                      stepIndex={0}
                    />
                    {currentStep && (
                      <group>
                        <MantisGrid 
                          state={currentStep.state} 
                          previousState={previousStep?.state}
                          label="PROCESS" 
                          position={[-2.25, 0, 0]} 
                          opType={currentStep.type}
                          stepIndex={stepIndex}
                          cellPositions={cellPositionsMap[stepIndex]}
                        />
                        {currentStep.roundTweakey && (
                          <MantisGrid 
                            state={currentStep.roundTweakey}
                            previousState={previousStep?.roundTweakey}
                            label="SUB-TWEAKEY (RT)"
                            position={[-1.8, 1.5, -6]}
                            stepIndex={stepIndex}
                            showValues={true}
                          />
                        )}
                        <MantisGrid 
                          state={currentStep.tweak}
                          label="TWEAK PERMUTATION (T)"
                          position={[-1.5, 3, -12]}
                          stepIndex={stepIndex}
                          showValues={true}
                        />
                      </group>
                    )}
                    {history && history.length > 0 && (
                      <MantisGrid 
                        state={history[history.length - 1].state} 
                        label={operation === 'encrypt' ? "CIPHERTEXT" : "PLAINTEXT"} 
                        position={[5.75, 0, 0]} 
                        showValues={stepIndex === history.length - 1}
                        stepIndex={history.length - 1}
                      />
                    )}
                  </group>
                )}
              </group>
            </Center>

            <OrbitControls 
              enablePan={false} 
              maxDistance={35} 
              minDistance={5} 
              autoRotate={!isPlaying && viewMode === 'single'} 
              autoRotateSpeed={0.2} 
            />
          </Canvas>

          {/* Floating UI Elements */}
          <div className="absolute top-6 right-6 w-48 bg-[#15171d] border border-[#374151] p-3 rounded shadow-2xl z-20 pointer-events-none">
            <div className="text-[9px] uppercase text-[#6b7280] font-bold tracking-widest mb-2">Step Context</div>
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
          </div>
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
            ) : currentStep.type === 'add_tweakey' ? (
              <div>
                <h3 className="text-[9px] text-[#6b7280] mb-2 font-bold uppercase tracking-wider">AddTweakey Math</h3>
                <div className="bg-[#1e2229] p-2 border border-[#2a2d35] rounded font-mono text-[10px] text-white/80 leading-relaxed">
                  <div>S' = S ⊕ h(T) ⊕ K1 ⊕ RC_r</div>
                  <div className="mt-2 text-amber-500/80">Each cell in the visualizer displays ⊕ [Value] to indicate the specific SubTweakey nibble being XORed.</div>
                </div>
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
                  {[0, 11, 2, 13, 10, 1, 8, 3, 5, 14, 4, 8, 12, 6, 9, 15].map((v, i) => (
                    <div key={i} className="bg-[#1e2229] p-1 text-[9px] font-mono text-center border border-[#2a2d35] text-white/70">
                      id:{v}
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
      </main>

      {/* Timeline & Controls Footer */}
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
      {/* VFX: Ambient Background Dust */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-cyan-500/5 blur-[150px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-500/5 blur-[120px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>
    </div>
  );
}
