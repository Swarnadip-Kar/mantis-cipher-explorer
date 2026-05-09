/**
 * MANTIS Block Cipher Logic
 * Accurate to the official description (Beierle et al. 2016)
 * This implementation records the state at every step for visualization.
 */

export type Nibble = number; // 4-bit unsigned integer (0-15)
export type State = Nibble[][]; // 4x4 matrix

export interface MantisStep {
  name: string;
  state: State;
  tweak: State;
  roundTweakey?: State;
  stepRc?: State;
  stepRk?: State;
  stepRkShifted?: State; // (k1 >>> 4*i)
  stepRcPrev?: State;    // LFSR input
  round: number;
  type: 'initial' | 'add_tweakey' | 'sub_cells' | 'shuffle_cells' | 'mix_columns' | 'mid' | 'round_complete' | 'final';
}

const SBOX: number[] = [0xc, 0xa, 0xd, 0x3, 0xe, 0xb, 0xf, 0x7, 0x8, 0x9, 0x1, 0x5, 0x0, 0x2, 0x4, 0x6];
const SBOX_INV: number[] = new Array(16);
SBOX.forEach((v, i) => (SBOX_INV[v] = i));

export const SHUFFLE: number[] = [0, 11, 6, 13, 10, 1, 12, 7, 5, 14, 3, 8, 15, 4, 9, 2];
export const SHUFFLE_INV: number[] = new Array(16);
SHUFFLE.forEach((v, i) => (SHUFFLE_INV[v] = i));

// Tweak Permutation h
export const H_PERM: number[] = [6, 5, 14, 15, 0, 1, 2, 3, 7, 12, 13, 4, 8, 9, 10, 11];

// Round Constants
const RC = [
  [0x1, 0x3, 0x1, 0x9, 0x8, 0xa, 0x2, 0xe, 0x0, 0x3, 0x7, 0x0, 0x7, 0x3, 0x4, 0x4],
  [0xa, 0x4, 0x0, 0x9, 0x3, 0x8, 0x2, 0x2, 0x2, 0x9, 0x9, 0xf, 0x3, 0x1, 0xd, 0x0],
  [0x0, 0x8, 0x2, 0xe, 0xf, 0xa, 0x9, 0x8, 0xe, 0xc, 0x4, 0xe, 0x6, 0xc, 0x8, 0x9],
  [0x4, 0x5, 0x2, 0x8, 0x2, 0x1, 0xe, 0x6, 0x3, 0x8, 0xd, 0x0, 0x1, 0x3, 0x7, 0x7],
  [0xb, 0xe, 0x5, 0x4, 0x6, 0x6, 0xc, 0xf, 0x3, 0x4, 0xe, 0x9, 0x0, 0xc, 0x6, 0xc],
  [0xc, 0x0, 0xa, 0xc, 0x2, 0x9, 0xb, 0x7, 0xc, 0x9, 0x7, 0xc, 0x5, 0x0, 0xd, 0xd],
  [0x3, 0xf, 0x8, 0x4, 0xd, 0x5, 0xb, 0x5, 0xb, 0x5, 0x4, 0x7, 0x0, 0x9, 0x1, 0x7],
  [0x9, 0x2, 0x1, 0x6, 0xd, 0x5, 0xd, 0x9, 0x8, 0x9, 0x7, 0x9, 0xf, 0xb, 0x1, 0xb],
];

// Matrix for MixColumns (Involutory)
const MixMatrix = [
  [0, 1, 1, 1],
  [1, 0, 1, 1],
  [1, 1, 0, 1],
  [1, 1, 1, 0],
];

export function createEmptyState(): State {
  return Array.from({ length: 4 }, () => [0, 0, 0, 0]);
}

export function flattenState(state: State): number[] {
  return state.flat();
}

export function unflattenState(flat: number[]): State {
  const result = createEmptyState();
  for (let i = 0; i < 16; i++) {
    result[Math.floor(i / 4)][i % 4] = flat[i];
  }
  return result;
}

function xorState(s1: State, s2: State): State {
  const result = createEmptyState();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      result[r][c] = s1[r][c] ^ s2[r][c];
    }
  }
  return result;
}

function subCells(state: State, inverse = false): State {
  const sbox = inverse ? SBOX_INV : SBOX;
  const result = createEmptyState();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      result[r][c] = sbox[state[r][c]];
    }
  }
  return result;
}

function shuffleCells(state: State, inverse = false): State {
  const flat = flattenState(state);
  const p = inverse ? SHUFFLE_INV : SHUFFLE;
  const nextFlat = new Array(16);
  for (let i = 0; i < 16; i++) {
    nextFlat[i] = flat[p[i]];
  }
  return unflattenState(nextFlat);
}

function mixColumns(state: State): State {
  const result = createEmptyState();
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let val = 0;
      for (let i = 0; i < 4; i++) {
        if (MixMatrix[r][i] === 1) {
          val ^= state[i][c];
        }
      }
      result[r][c] = val;
    }
  }
  return result;
}

function permuteTweak(tweak: State): State {
  const flat = tweak.flat();
  const nextFlat = new Array(16);
  for (let i = 0; i < 16; i++) {
    nextFlat[i] = flat[H_PERM[i]];
  }
  return unflattenState(nextFlat);
}

function alphaConstant(round: number): State {
  return unflattenState(RC[round]);
}

const ALPHA_BIGINT = 0x243F6A8885A308D3n;

function toState(val: bigint): State {
  const s = createEmptyState();
  for (let i = 0; i < 16; i++) {
    s[Math.floor(i / 4)][i % 4] = Number((val >> BigInt((15 - i) * 4)) & 0xFn);
  }
  return s;
}

function fromState(s: State): bigint {
  let val = 0n;
  for (let i = 0; i < 16; i++) {
    val = (val << 4n) | BigInt(s[Math.floor(i / 4)][i % 4]);
  }
  return val;
}

function ror64(x: bigint, n: bigint): bigint {
  const shift = n % 64n;
  return ((x >> shift) | (x << (64n - shift))) & 0xFFFFFFFFFFFFFFFFn;
}

/**
 * Mantis encryption / decryption
 */
export function mantisCipher(
  plaintext: State,
  key0: State,
  key1: State,
  tweak: State,
  rounds = 7,
  decrypt = false
): MantisStep[] {
  const history: MantisStep[] = [];
  
  let currentStepRc: State | undefined = undefined;
  let currentStepRk: State | undefined = undefined;

  let currentStepRcPrev: State | undefined = undefined;
  let currentStepRkShifted: State | undefined = undefined;

  const push = (name: string, type: MantisStep['type'], r: number, additionalProps?: Partial<MantisStep>) => {
    history.push({
      name,
      state: JSON.parse(JSON.stringify(currentState)),
      tweak: JSON.parse(JSON.stringify(currentTweak)),
      stepRc: currentStepRc ? JSON.parse(JSON.stringify(currentStepRc)) : undefined,
      stepRcPrev: currentStepRcPrev ? JSON.parse(JSON.stringify(currentStepRcPrev)) : undefined,
      stepRk: currentStepRk ? JSON.parse(JSON.stringify(currentStepRk)) : undefined,
      stepRkShifted: currentStepRkShifted ? JSON.parse(JSON.stringify(currentStepRkShifted)) : undefined,
      round: r,
      type,
      ...additionalProps
    });
  };

  const k0_val = fromState(key0);
  const k1_val = fromState(key1);
  const tweak_val = fromState(tweak);

  let k0p_val = ror64(k0_val, 1n) ^ (k0_val >> 63n);
  let kb1_val = k1_val ^ ALPHA_BIGINT;
  
  let k0_n = key0;
  let k1_n = key1;
  let k0p_n = toState(k0p_val);
  let kb1_n = toState(kb1_val);
  let alp_n = toState(ALPHA_BIGINT);
  
  const T = tweak;

  let hp: State[] = [T];
  for(let i = 0; i < rounds; i++) {
    hp.push(permuteTweak(hp[i]));
  }

  let currentState = plaintext;
  let currentTweak = hp[0];

  push(decrypt ? 'Ciphertext' : 'Plaintext', 'initial', 0);

  if (!decrypt) {
    // ENCRYPT

    // Initial whitening:  s ⊕= k0 ⊕ k1 ⊕ T
    currentStepRc = k0_n;
    currentStepRk = k1_n;
    const initTweakey = xorState(xorState(k0_n, k1_n), T);
    currentState = xorState(currentState, initTweakey);
    push('Initial AddTweakey', 'add_tweakey', 0, { roundTweakey: initTweakey });

    // Forward half
    for (let r = 1; r <= rounds; r++) {
      currentTweak = hp[r];
      currentStepRc = alphaConstant(r - 1);
      currentStepRk = k1_n;
      
      currentState = subCells(currentState);
      push(`Round ${r} SubCells`, 'sub_cells', r);

      let rcState = currentStepRc;
      let rk_n = currentStepRk;
      let tk = xorState(hp[r], rk_n);

      currentState = xorState(currentState, rcState);
      currentState = xorState(currentState, tk);
      
      let roundTweakey = xorState(rcState, tk);
      push(`Round ${r} AddKey/C/T`, 'add_tweakey', r, { roundTweakey });

      currentState = shuffleCells(currentState, false);
      push(`Round ${r} PermuteCells`, 'shuffle_cells', r);

      currentState = mixColumns(currentState);
      push(`Round ${r} MixColumns`, 'mix_columns', r);
    }
    
    // Middle layer
    currentState = subCells(currentState);
    push(`Middle SubCells`, 'sub_cells', rounds);
    currentState = mixColumns(currentState);
    push(`Middle MixColumns`, 'mix_columns', rounds);
    currentState = subCells(currentState);
    push(`Middle InvSubCells`, 'sub_cells', rounds);

    push(`Middle Layer Output`, 'round_complete', rounds);

    // Backward half
    for (let r = rounds; r >= 1; r--) {
      currentTweak = hp[r];
      currentStepRc = alphaConstant(r - 1);
      currentStepRk = kb1_n; // k1 ^ alpha
      
      currentState = mixColumns(currentState);
      push(`Round ${r}' InvMixColumns`, 'mix_columns', rounds * 2 - r + 1);
      
      currentState = shuffleCells(currentState, true);
      push(`Round ${r}' InvPermuteCells`, 'shuffle_cells', rounds * 2 - r + 1);

      let rcState = currentStepRc;
      let rk_n = currentStepRk;
      let tk = xorState(hp[r], rk_n);

      currentState = xorState(currentState, tk);
      currentState = xorState(currentState, rcState);
      
      let roundTweakey = xorState(rcState, tk);
      push(`Round ${r}' AddKey/C/T`, 'add_tweakey', rounds * 2 - r + 1, { roundTweakey });

      currentState = subCells(currentState);
      push(`Round ${r}' InvSubCells`, 'sub_cells', rounds * 2 - r + 1);
    }

    // Final whitening: s ⊕= k0p ⊕ k1 ⊕ α ⊕ T
    currentStepRc = k0p_n;
    currentStepRk = xorState(k1_n, alp_n);
    const finalTweakey = xorState(xorState(xorState(k0p_n, k1_n), alp_n), T);
    currentState = xorState(currentState, finalTweakey);
    push('Final AddTweakey', 'add_tweakey', rounds * 2 + 1, { roundTweakey: finalTweakey });

  } else {
    // DECRYPT

    // new k0 = k0p
    // new k1 = k1_n ^ ALPHA
    // init whitening = k0p ^ kb1_n ^ T
    currentStepRc = k0p_n;
    currentStepRk = kb1_n;
    const initTweakey = xorState(xorState(k0p_n, kb1_n), T);
    currentState = xorState(currentState, initTweakey);
    push('Initial AddTweakey', 'add_tweakey', 0, { roundTweakey: initTweakey });

    // Forward rounds
    for (let r = 1; r <= rounds; r++) {
      currentTweak = hp[r];
      currentStepRc = alphaConstant(r - 1);
      currentStepRk = kb1_n; // k1 ^ alpha
      
      currentState = subCells(currentState);
      push(`Round ${r} SubCells`, 'sub_cells', r);

      let rcState = currentStepRc;
      let rk_n = currentStepRk;
      let tk = xorState(hp[r], rk_n);

      currentState = xorState(currentState, rcState);
      currentState = xorState(currentState, tk);
      
      let roundTweakey = xorState(rcState, tk);
      push(`Round ${r} AddKey/C/T`, 'add_tweakey', r, { roundTweakey });

      currentState = shuffleCells(currentState, false);
      push(`Round ${r} PermuteCells`, 'shuffle_cells', r);

      currentState = mixColumns(currentState);
      push(`Round ${r} MixColumns`, 'mix_columns', r);
    }
    
    // Middle layer
    currentState = subCells(currentState);
    push(`Middle SubCells`, 'sub_cells', rounds);
    currentState = mixColumns(currentState);
    push(`Middle MixColumns`, 'mix_columns', rounds);
    currentState = subCells(currentState);
    push(`Middle InvSubCells`, 'sub_cells', rounds);
    push(`Middle Layer Output`, 'round_complete', rounds);

    // Backward rounds
    for (let r = rounds; r >= 1; r--) {
      currentTweak = hp[r];
      
      currentState = mixColumns(currentState);
      push(`Round ${r}' InvMixColumns`, 'mix_columns', rounds * 2 - r + 1);
      
      currentState = shuffleCells(currentState, true);
      push(`Round ${r}' InvPermuteCells`, 'shuffle_cells', rounds * 2 - r + 1);

      currentStepRc = alphaConstant(r - 1);
      currentStepRk = k1_n;
      let rcState = currentStepRc;
      let rk_n = currentStepRk;
      let tk = xorState(hp[r], rk_n);

      currentState = xorState(currentState, tk);
      currentState = xorState(currentState, rcState);
      
      let roundTweakey = xorState(rcState, tk);
      push(`Round ${r}' AddKey/C/T`, 'add_tweakey', rounds * 2 - r + 1, { roundTweakey });

      currentState = subCells(currentState);
      push(`Round ${r}' InvSubCells`, 'sub_cells', rounds * 2 - r + 1);
    }

    // Final whitening: new_k0' ⊕ new_k1 ⊕ α ⊕ T = k0 ⊕ k1 ⊕ T
    currentStepRc = k0_n;
    currentStepRk = k1_n;
    const finalTweakey = xorState(xorState(k0_n, k1_n), T);
    currentState = xorState(currentState, finalTweakey);
    push('Final AddTweakey', 'add_tweakey', rounds * 2 + 1, { roundTweakey: finalTweakey });

  }

  currentTweak = hp[0];
  push(decrypt ? 'Plaintext' : 'Ciphertext', 'final', rounds * 2 + 2);

  return history;
}
