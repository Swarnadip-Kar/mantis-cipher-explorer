import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Layers, Activity, Target, Play, Pause, SkipBack, SkipForward, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import { TrackballControls, Float, Text, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CellState {
  id: number;
  val: number; // 0: C, 1: A, 2: B, 3: U
  posIndex: number;
}

function generateIntegralSteps(startProps: number[], rounds: number) {
  let currentCells = Array.from({length: 16}).map((_, i) => ({ id: i, val: startProps[i], posIndex: i }));
  const steps = [];
  steps.push({ name: 'Initial Properties', cells: JSON.parse(JSON.stringify(currentCells)), opType: 'initial' });
  
  for (let r = 1; r <= rounds; r++) {
    // 1. SubCells
    currentCells = currentCells.map(c => {
      let nextVal = c.val;
      if (c.val === 1) nextVal = 1; // A -> A
      else if (c.val === 0) nextVal = 0; // C -> C
      else if (c.val === 2) nextVal = 3; // B -> U
      else nextVal = 3; // U -> U
      return { ...c, val: nextVal };
    });
    steps.push({ name: `Round ${r} SubCells`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'sub_cells' });
    
    // 2. PermuteCells
    const P = [0, 11, 6, 13, 10, 1, 12, 7, 5, 14, 3, 8, 15, 4, 9, 2];
    currentCells = currentCells.map(c => {
      const newPos = P.indexOf(c.posIndex);
      return { ...c, posIndex: newPos };
    });
    steps.push({ name: `Round ${r} PermuteCells`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'shuffle_cells' });
    
    // 3. MixColumns
    const grid = Array(16).fill(0);
    currentCells.forEach(c => grid[c.posIndex] = c.val);
    const nextGrid = Array(16).fill(0);
    const M_MAT = [
         [0, 1, 1, 1],
         [1, 0, 1, 1],
         [1, 1, 0, 1],
         [1, 1, 1, 0]
    ];
    for (let col = 0; col < 4; col++) {
      const cVals = [grid[col], grid[4+col], grid[8+col], grid[12+col]];
      for (let row = 0; row < 4; row++) {
         let hasU = false;
         let numA = 0;
         let numB = 0;
         for (let k = 0; k < 4; k++) {
            if (M_MAT[row][k]) {
               if (cVals[k] === 3) hasU = true;
               if (cVals[k] === 1) numA++;
               if (cVals[k] === 2) numB++;
            }
         }
         let v = 0; // C
         if (hasU) v = 3; // U
         else if (numA === 1) v = 1; // Exactly one A -> A
         else if (numA > 1) v = 2; // Multiple A's -> B
         else if (numB > 0) v = 2; // B
         nextGrid[row*4 + col] = v;
      }
    }
    
    currentCells = nextGrid.map((val, i) => ({ id: r * 100 + i, val, posIndex: i }));
    steps.push({ name: `Round ${r} MixColumns`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'mix_columns' });
  }
  
  return steps;
}

const getCellPosition = (posIndex: number): [number, number, number] => {
  const row = Math.floor(posIndex / 4);
  const col = posIndex % 4;
  return [(col - 1.5) * 1.1, (1.5 - row) * 1.1, 0];
};

const PROP_INFO = {
  0: { label: 'C', color: '#64748b' }, // gray
  1: { label: 'A', color: '#3b82f6' }, // blue
  2: { label: 'B', color: '#10b981' }, // emerald
  3: { label: 'U', color: '#090a0c' }, // unknown / black
};

function IntegralCell({ cell, isChanging, opType }: any) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = getCellPosition(cell.posIndex);
  const [initPos] = useState(() => targetPos);
  
  const info = PROP_INFO[cell.val as 0|1|2|3];
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.lerp(new THREE.Vector3(...targetPos), 8 * delta);
    }
  });

  return (
    <group ref={groupRef} position={initPos}>
      <mesh>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={cell.val === 3 ? '#1e293b' : info.color} metalness={0.5} roughness={0.5} 
          emissive={isChanging && cell.val !== 3 && cell.val !== 0 ? info.color : '#000000'} emissiveIntensity={0.5} />
      </mesh>
      <Text position={[0,0,0.41]} fontSize={0.4} color={cell.val === 3 ? "#4b5563" : "#ffffff"} anchorX="center" anchorY="middle">
        {info.label}
      </Text>
    </group>
  );
}

function IntegralGrid({ cells, opType }: any) {
  return (
    <group>
      {cells.map((c: any) => (
        <IntegralCell key={c.id} cell={c} isChanging={opType === 'sub_cells' || opType === 'mix_columns'} opType={opType} />
      ))}
    </group>
  );
}

export function IntegralAttackTab() {
  const [rounds, setRounds] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // A property in third row (pos 8)
  const [startProps, setStartProps] = useState<number[]>(() => { const a=Array(16).fill(0); a[8]=1; return a; });

  const steps = useMemo(() => generateIntegralSteps(startProps, rounds), [rounds, startProps.join(',')]);
  const currentStep = steps[stepIndex];

  useEffect(() => {
    let timer: any;
    if (playing) {
      timer = setTimeout(() => {
        if (stepIndex < steps.length - 1) {
          setStepIndex((s) => s + 1);
        } else {
          setPlaying(false);
        }
      }, 1500);
    }
    return () => clearTimeout(timer);
  }, [playing, stepIndex, steps.length]);

  return (
    <div className="flex w-full h-full bg-[#090a0c] text-white">
      {/* Sidebar */}
      <aside className="w-80 border-r border-[#2a2d35] bg-[#111318] p-4 flex flex-col space-y-6 overflow-y-auto z-10">
        <div>
          <h2 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Layers className="w-3 h-3" /> Integral Attack
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Integral cryptanalysis tracks properties of multisets of plaintexts through a cipher, rather than differences.
          </p>
        </div>

        <div className="p-3 bg-black/30 border border-[#2a2d35] rounded">
          <h3 className="text-[10px] font-bold text-white mb-4 uppercase">Simulation Properties</h3>
          
          <div className="space-y-3">
             <div className="flex items-center gap-2">
               <div className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/50 flex items-center justify-center text-[10px] font-bold">A</div>
               <div className="text-xs text-gray-300">All (takes all 16 values)</div>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 flex items-center justify-center text-[10px] font-bold">B</div>
               <div className="text-xs text-gray-300">Balanced (XOR sum is 0)</div>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-5 h-5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/50 flex items-center justify-center text-[10px] font-bold">C</div>
               <div className="text-xs text-gray-300">Constant (fixed value)</div>
             </div>
             <div className="flex items-center gap-2">
               <div className="w-5 h-5 rounded bg-[#1a1c22] text-[#4b5563] border border-[#2a2d35] flex items-center justify-center text-[10px] font-bold">U</div>
               <div className="text-xs text-gray-300">Unknown</div>
             </div>
          </div>
        </div>
        
        <div className="p-3 bg-black/30 border border-[#2a2d35] rounded mt-4">
          <h3 className="text-[10px] font-bold text-white mb-2 uppercase">Configuration</h3>
          <div>
            <label className="text-[10px] text-gray-400 mr-2 flex justify-between">Observation Rounds <span>{rounds}</span></label>
            <input type="range" min={1} max={7} value={rounds} onChange={e => { setRounds(parseInt(e.target.value)); setStepIndex(0); }} className="w-full flex-1 appearance-none bg-white/10 h-1 rounded outline-none flex mt-2" />
          </div>
          <p className="text-xs text-gray-500 mt-4">
            The paper defines an optimal choice: start with one active cell (A) in the 3rd row, aiming to maximize the number of rounds preserving non-trivial properties.
          </p>
        </div>

        <div className="p-3 bg-black/30 border border-[#2a2d35] rounded mt-4">
          <h3 className="text-[10px] font-bold text-white mb-2 uppercase">Input Properties</h3>
          <p className="text-[10px] text-gray-500 mb-3">Click to cycle properties: A → C → B → U</p>
          <div className="grid grid-cols-4 gap-1 p-2 bg-[#1a1c22] border border-[#2a2d35] rounded w-full">
            {startProps.map((val, i) => {
              const info = PROP_INFO[val as 0|1|2|3];
              return (
                <button
                  key={i}
                  className="w-full aspect-square font-mono text-sm border rounded focus:outline-none transition-colors"
                  style={{ backgroundColor: val === 3 ? '#1e293b' : info.color + '30', borderColor: val === 3 ? '#334155' : info.color, color: val === 3 ? '#4b5563' : info.color }}
                  onClick={() => {
                    // map: 1(A) -> 0(C) -> 2(B) -> 3(U) -> 1(A)
                    const map: Record<number, number> = { 1: 0, 0: 2, 2: 3, 3: 1 };
                    const newProps = [...startProps];
                    newProps[i] = map[val];
                    setStartProps(newProps);
                    setStepIndex(0);
                    setPlaying(false);
                  }}
                  title={`Cell ${i}`}
                >
                  {info.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-3 bg-black/30 border border-[#2a2d35] rounded mt-4">
          <div className="text-[10px] font-bold text-white mb-2 uppercase">Step Properties Count</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between items-center"><span className="text-blue-400">All:</span> <span className="font-mono">{currentStep.cells.filter((c: any) => c.val === 1).length}</span></div>
            <div className="flex justify-between items-center"><span className="text-gray-400">Const:</span> <span className="font-mono">{currentStep.cells.filter((c: any) => c.val === 0).length}</span></div>
            <div className="flex justify-between items-center"><span className="text-emerald-400">Balants:</span> <span className="font-mono">{currentStep.cells.filter((c: any) => c.val === 2).length}</span></div>
            <div className="flex justify-between items-center"><span className="text-[#4b5563]">Unknown:</span> <span className="font-mono">{currentStep.cells.filter((c: any) => c.val === 3).length}</span></div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="px-6 py-4 bg-[#111318] border-b border-[#2a2d35] flex items-center justify-between z-10 shadow-lg">
          <div>
            <h3 className="text-xl font-light text-emerald-400 tracking-wider">Property Evolution - {currentStep.name}</h3>
            <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Simulating 16 parallel plaintexts dynamically</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-white/5 p-1 rounded border border-white/5">
              <button onClick={() => { setPlaying(false); setStepIndex(0); }} className="p-2 hover:bg-white/10 rounded transition-colors text-white">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => { setPlaying(false); setStepIndex(Math.max(0, stepIndex - 1)); }} className="p-2 hover:bg-white/10 rounded transition-colors text-white">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={() => setPlaying(!playing)} className="p-2 hover:bg-white/10 rounded transition-colors text-white">
                {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
              </button>
              <button onClick={() => { setPlaying(false); setStepIndex(Math.min(steps.length - 1, stepIndex + 1)); }} className="p-2 hover:bg-white/10 rounded transition-colors text-white">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 3D Canvas View */}
        <div className="flex-1 relative cursor-grab">
          <Canvas shadows camera={{ position: [0, 2, 8], fov: 45 }}>
            <color attach="background" args={['#090a0c']} />
            <fog attach="fog" args={['#090a0c', 10, 30]} />
            
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={1} castShadow shadow-bias={-0.0001} />
            <pointLight position={[-10, 10, -10]} intensity={0.5} color="#10b981" />
            <rectAreaLight width={10} height={10} intensity={2} color="#10b981" position={[0, 5, -5]} />
            
            <Environment preset="city" />
            
            <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
              <group position={[0, 0, 0]}>
                <IntegralGrid cells={currentStep.cells} opType={currentStep.opType} />
              </group>
            </Float>
            
            <ContactShadows position={[0, -2, 0]} opacity={0.6} scale={15} blur={2.5} far={4} color="#064e3b" />
            <TrackballControls noPan noZoom rotateSpeed={2} />
          </Canvas>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-center">
            <p className="text-white/60 text-sm bg-black/40 px-4 py-2 rounded-full border border-white/5 backdrop-blur shadow-xl">
              {currentStep.opType === 'sub_cells' && "S-box preserves (A, C) bijections, but Balanced (B) diffuses to Unknown (U)."}
              {currentStep.opType === 'shuffle_cells' && "PermuteCells deterministically shuffles the properties."}
              {currentStep.opType === 'mix_columns' && "MixColumns sums properties: 1xA+3xC=A, >1xA=B. Mix spreads uncertainty!"}
              {currentStep.opType === 'initial' && "Starting with one active cell (A), taking all 16 values while others are constant (C)."}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
