import React, { useState, useMemo, useRef, useEffect } from 'react';
import { State, createEmptyState, mantisCipher } from './lib/mantis';
import { ArrowRight, Layers, LayoutGrid, Target, X, Play, Pause, SkipBack, SkipForward, RefreshCw } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Canvas, useFrame } from '@react-three/fiber';
import { TrackballControls, Float, Text, ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SB0 = [0xC, 0xA, 0xD, 0x3, 0xE, 0xB, 0xF, 0x7, 0x8, 0x9, 0x1, 0x5, 0x0, 0x2, 0x4, 0x6];

const computeDDT = () => {
  const ddt = Array.from({ length: 16 }, () => Array(16).fill(0));
  for (let dx = 0; dx < 16; dx++) {
    for (let x = 0; x < 16; x++) {
      const y1 = SB0[x];
      const y2 = SB0[x ^ dx];
      const dy = y1 ^ y2;
      ddt[dx][dy]++;
    }
  }
  return ddt;
};

const DDT = computeDDT();

const COLORS = [
  '#000000', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', 
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'
];

interface CellState {
  id: number;
  val: number;
  posIndex: number;
}

function generateDiffSteps(startDiff: number[], rounds: number) {
  let currentCells = Array.from({length: 16}).map((_, i) => ({ id: i, val: startDiff[i], posIndex: i }));
  const steps = [];
  let trailProbability = 1;
  let activeSboxes = 0;

  steps.push({ name: 'Initial Difference', cells: JSON.parse(JSON.stringify(currentCells)), opType: 'initial', trailProbability, activeSboxes });
  
  for (let r = 1; r <= rounds; r++) {
    let roundProb = 1;
    let roundActive = 0;
    currentCells = currentCells.map(c => {
      let nextVal = c.val;
      if (c.val !== 0) {
        let maxProb = 0, bestDy = 0;
        for (let dy = 1; dy < 16; dy++) {
           if (DDT[c.val][dy] > maxProb) { maxProb = DDT[c.val][dy]; bestDy = dy; }
        }
        nextVal = bestDy;
        roundProb *= (maxProb / 16);
        roundActive++;
      }
      return { ...c, val: nextVal };
    });
    trailProbability *= roundProb;
    activeSboxes += roundActive;
    steps.push({ name: `Round ${r} SubCells`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'sub_cells', trailProbability, activeSboxes });
    
    const P = [0, 11, 6, 13, 10, 1, 12, 7, 5, 14, 3, 8, 15, 4, 9, 2];
    currentCells = currentCells.map(c => {
      const newPos = P.indexOf(c.posIndex);
      return { ...c, posIndex: newPos };
    });
    steps.push({ name: `Round ${r} PermuteCells`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'shuffle_cells', trailProbability, activeSboxes });
    
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
         let v = 0;
         for (let k = 0; k < 4; k++) {
            if (M_MAT[row][k]) v ^= cVals[k];
         }
         nextGrid[row*4 + col] = v;
      }
    }
    currentCells = nextGrid.map((val, i) => ({ id: r * 100 + i, val, posIndex: i }));
    steps.push({ name: `Round ${r} MixColumns`, cells: JSON.parse(JSON.stringify(currentCells)), opType: 'mix_columns', trailProbability, activeSboxes });
  }
  
  return steps;
}

const getCellPosition = (posIndex: number): [number, number, number] => {
  const row = Math.floor(posIndex / 4);
  const col = posIndex % 4;
  return [(col - 1.5) * 1.1, (1.5 - row) * 1.1, 0];
};

function DiffCell({ cell, isChanging, opType }: any) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = getCellPosition(cell.posIndex);
  const [initPos] = useState(() => targetPos);
  
  const color = cell.val === 0 ? '#1e293b' : COLORS[cell.val % 16];
  
  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.position.lerp(new THREE.Vector3(...targetPos), 8 * delta);
    }
  });

  return (
    <group ref={groupRef} position={initPos}>
      <mesh>
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.5} 
          emissive={isChanging && cell.val !== 0 ? color : '#000000'} emissiveIntensity={0.5} />
      </mesh>
      {cell.val !== 0 && (
        <Text position={[0,0,0.41]} fontSize={0.4} color="#ffffff" anchorX="center" anchorY="middle">
          {cell.val.toString(16).toUpperCase()}
        </Text>
      )}
    </group>
  );
}

function DiffGrid({ cells, opType }: any) {
  return (
    <group>
      {cells.map((c: any) => (
        <DiffCell key={c.id} cell={c} isChanging={opType === 'sub_cells' || opType === 'mix_columns'} opType={opType} />
      ))}
    </group>
  );
}

function unflatten(flat: number[]): State {
  const res = createEmptyState();
  flat.forEach((v, i) => (res[Math.floor(i / 4)][i % 4] = v));
  return res;
}

export function DifferentialAttackTab() {
  const [activeView, setActiveView] = useState<'ddt' | 'propagation'>('ddt');
  
  const [inputDiff, setInputDiff] = useState(1);
  const [outputDiff, setOutputDiff] = useState(1);

  const [rounds, setRounds] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Single cell difference at position 2 like the paper example
  const [startDiff, setStartDiff] = useState<number[]>(() => { const a=Array(16).fill(0); a[2]=2; return a; });

  const steps = useMemo(() => generateDiffSteps(startDiff, rounds), [rounds, startDiff]);
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
    <div className="flex w-full h-full bg-[#090a0c] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-80 border-r border-[#2a2d35] bg-[#111318] p-4 flex flex-col space-y-6 overflow-y-auto">
        <div>
          <h2 className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Target className="w-3 h-3" /> Differential Attack
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Differential cryptanalysis is an attack that analyzes how differences in input affect the differences at the output of a cipher.
          </p>
        </div>

        <div className="space-y-2">
          <button 
            onClick={() => setActiveView('ddt')}
            className={cn("w-full px-4 py-2 text-xs font-bold text-left rounded border transition-colors flex items-center gap-2", 
              activeView === 'ddt' ? "bg-purple-900/30 text-purple-300 border-purple-500/50" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")}
          >
            <LayoutGrid className="w-4 h-4" /> Difference Distribution
          </button>
          <button 
            onClick={() => { setActiveView('propagation'); setStepIndex(0); setPlaying(true); }}
            className={cn("w-full px-4 py-2 text-xs font-bold text-left rounded border transition-colors flex items-center gap-2", 
              activeView === 'propagation' ? "bg-purple-900/30 text-purple-300 border-purple-500/50" : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10")}
          >
            <ArrowRight className="w-4 h-4" /> Difference Propagation
          </button>
        </div>

        {activeView === 'ddt' && (
          <div className="p-3 bg-black/30 border border-[#2a2d35] rounded mt-4">
            <h3 className="text-[10px] font-bold text-white mb-2 uppercase">Analysis Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 mr-2 flex justify-between">Input Difference (ΔX) <span>{inputDiff.toString(16).toUpperCase()}</span></label>
                <input type="range" min={0} max={15} value={inputDiff} onChange={e => setInputDiff(parseInt(e.target.value))} className="w-full flex-1 appearance-none bg-white/10 h-1 rounded outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 mr-2 flex justify-between">Output Difference (ΔY) <span>{outputDiff.toString(16).toUpperCase()}</span></label>
                <input type="range" min={0} max={15} value={outputDiff} onChange={e => setOutputDiff(parseInt(e.target.value))} className="w-full flex-1 appearance-none bg-white/10 h-1 rounded outline-none" />
              </div>
              <div className="mt-4 pt-4 border-t border-[#2a2d35]">
                <div className="text-xs text-gray-400">Hits (out of 16)</div>
                <div className="text-2xl font-bold text-purple-400">{DDT[inputDiff][outputDiff]}</div>
                <div className="text-[10px] text-gray-500">Probability: {DDT[inputDiff][outputDiff]}/16</div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'propagation' && (
          <div className="p-3 bg-black/30 border border-[#2a2d35] rounded mt-4">
             <h3 className="text-[10px] font-bold text-white mb-2 uppercase">Input Difference (ΔX)</h3>
             <p className="text-[10px] text-gray-500 mb-3">Click and type (0-F) to set the initial difference state.</p>
             <div className="grid grid-cols-4 gap-1 p-2 bg-[#1a1c22] border border-[#2a2d35] rounded w-full">
               {startDiff.map((val, i) => (
                 <input 
                   key={i}
                   type="text"
                   className="w-full aspect-square text-center font-mono text-sm bg-[#090a0c] border border-[#374151] rounded focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-white"
                   value={val ? val.toString(16).toUpperCase() : '0'}
                   onChange={(e) => {
                     let char = e.target.value.slice(-1);
                     if (e.target.value === '') char = '0';
                     const num = parseInt(char, 16);
                     const newDiff = [...startDiff];
                     newDiff[i] = isNaN(num) ? 0 : num;
                     setStartDiff(newDiff);
                     setStepIndex(0);
                     setPlaying(false);
                   }}
                   onFocus={(e) => { e.target.select(); }}
                   title={`Cell ${i}`}
                 />
               ))}
             </div>
             
             <div className="mt-4 pt-4 border-t border-[#2a2d35]">
               <label className="text-[10px] text-gray-400 mr-2 flex justify-between">Rounds <span>{rounds}</span></label>
               <input type="range" min={1} max={7} value={rounds} onChange={e => {setRounds(parseInt(e.target.value)); setStepIndex(0); setPlaying(false);}} className="w-full flex-1 appearance-none bg-white/10 h-1 rounded outline-none" />
             </div>

             <div className="mt-4 pt-4 border-t border-[#2a2d35]">
               <div className="text-[10px] font-bold text-white mb-2 uppercase">Trail Statistics</div>
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs text-gray-400">Total Active S-boxes:</span>
                 <span className="text-xs font-mono font-bold text-purple-400">{currentStep.activeSboxes}</span>
               </div>
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs text-gray-400">Round Active S-boxes:</span>
                 <span className="text-xs font-mono font-bold text-purple-400">{currentStep.cells.filter((c: any) => c.val !== 0).length}</span>
               </div>
               <div className="flex justify-between items-center">
                 <span className="text-xs text-gray-400">Probability:</span>
                 <span className="text-xs font-mono font-bold text-purple-400">
                   {currentStep.trailProbability === 1 ? '1' : `2^${Math.round(Math.log2(currentStep.trailProbability) * 100) / 100}`}
                 </span>
               </div>
             </div>
          </div>
        )}
      </aside>

      {/* Main visualization */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {activeView === 'ddt' ? (
          <div className="p-8">
            <h2 className="text-xl font-light mb-2">Difference Distribution Table (DDT)</h2>
            <p className="text-gray-400 text-sm mb-8">
              The DDT shows how input differences (rows) probabilistically map to output differences (columns) through the non-linear S-box.
              Lighter cells mean higher probability. The MIDORI S-box has a max differential probability of 2⁻².
            </p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 border border-[#2a2d35] bg-[#1a1c22] text-[#6b7280]">ΔX \ ΔY</th>
                    {Array.from({length: 16}).map((_, i) => (
                      <th key={i} className="p-2 border border-[#2a2d35] bg-[#1a1c22] w-8">{(i).toString(16).toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DDT.map((row, dx) => (
                    <tr key={dx}>
                      <th className="p-2 border border-[#2a2d35] bg-[#1a1c22]">{(dx).toString(16).toUpperCase()}</th>
                      {row.map((val, dy) => {
                        const isSelected = dx === inputDiff && dy === outputDiff;
                        let bg = 'bg-[#090a0c]';
                        if (val > 0) bg = 'bg-purple-900/20';
                        if (val > 2) bg = 'bg-purple-800/40 text-white font-bold';
                        if (val > 4) bg = 'bg-purple-600/60 text-white font-bold';
                        
                        return (
                          <td 
                            key={dy} 
                            className={cn(
                              "p-2 border border-[#2a2d35] relative cursor-pointer hover:bg-purple-500/20",
                              bg,
                              isSelected && "ring-2 ring-purple-400 z-10 font-bold"
                            )}
                            onClick={() => { setInputDiff(dx); setOutputDiff(dy); }}
                          >
                            <span className={val === 0 ? "text-gray-600/30" : ""}>{val}</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Simulation Header */}
            <div className="px-6 py-4 bg-[#111318] border-b border-[#2a2d35] flex items-center justify-between z-10 shadow-lg">
              <div>
                <h3 className="text-xl font-light text-purple-400 tracking-wider">Differential Trail - {currentStep.name}</h3>
                <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Tracing single-cell difference propagation</p>
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
                <pointLight position={[-10, 10, -10]} intensity={0.5} color="#c084fc" />
                <rectAreaLight width={10} height={10} intensity={2} color="#c084fc" position={[0, 5, -5]} />
                
                <Environment preset="city" />
                
                <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
                  <group position={[0, 0, 0]}>
                    <DiffGrid cells={currentStep.cells} opType={currentStep.opType} />
                  </group>
                </Float>
                
                <ContactShadows position={[0, -2, 0]} opacity={0.6} scale={15} blur={2.5} far={4} color="#581c87" />
                <TrackballControls noPan noZoom rotateSpeed={2} />
              </Canvas>
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-center">
                <p className="text-white/60 text-sm bg-black/40 px-4 py-2 rounded-full border border-white/5 backdrop-blur shadow-xl">
                  {currentStep.opType === 'sub_cells' && "S-box replaces differences with most probable output difference."}
                  {currentStep.opType === 'shuffle_cells' && "PermuteCells deterministically shuffles the active differences."}
                  {currentStep.opType === 'mix_columns' && "MixColumns sum diffuses the active difference to multiple cells."}
                  {currentStep.opType === 'initial' && "Starting with one active cell. The goal is to track active S-boxes."}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
