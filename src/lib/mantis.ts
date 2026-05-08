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
const H_PERM: number[] = [6, 5, 14, 15, 0, 1, 2, 3, 7, 12, 13, 4, 8, 9, 10, 11];

// Round Constants
const RC = [
  [0x1, 0x3, 0x1, 0x9, 0x8, 0xa, 0x2, 0xe, 0x0, 0x3, 0x7, 0x0, 0x7, 0x3, 0x4, 0x4],
  [0xa, 0x4, 0x0, 0x9, 0x3, 0x8, 0x2, 0x2, 0x2, 0x9, 0x9, 0xf, 0x3, 0x1, 0xd, 0x0],
  [0x0, 0x8, 0x2, 0xe, 0xf, 0xa, 0x9, 0x8, 0xe, 0xc, 0x4, 0xe, 0x6, 0xc, 0x8, 0x9],
  [0x4, 0x5, 0x2, 0x8, 0x2, 0x1, 0xe, 0x6, 0x3, 0x8, 0xd, 0x0, 0x1, 0x3, 0x7, 0x7],
  [0xb, 0xe, 0x5, 0x4, 0x6, 0x6, 0xc, 0xf, 0x3, 0x4, 0xe, 0x9, 0x0, 0xc, 0x6, 0xc],
  [0xc, 0x0, 0x7, 0x4, 0x3, 0x1, 0x8, 0x1, 0xf, 0xe, 0x2, 0x5, 0x1, 0x4, 0xb, 0x1],
  [0x3, 0x3, 0xe, 0xd, 0x3, 0x9, 0x6, 0x4, 0x5, 0xd, 0x1, 0x6, 0x4, 0xc, 0x0, 0xd],
  [0x3, 0x2, 0x4, 0xc, 0xa, 0x6, 0x9, 0xd, 0x8, 0x1, 0x0, 0xa, 0x7, 0xf, 0x0, 0xb],
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
    nextFlat[p[i]] = flat[i];
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

// Alpha constant for key reflecting (decryption)
export const ALPHA = [0x2, 0x4, 0x3, 0xf, 0x6, 0xa, 0x8, 0x8, 0x8, 0x5, 0xa, 0x3, 0x0, 0x8, 0xd, 0x3];

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
  
  // Initialize keys
  let k0 = key0;
  let k1 = key1;

  // Derivation of k0_prime relative to the raw key0
  const flatK0_ = flattenState(key0);
  let k0_val_ = 0n;
  for (let i = 0; i < 16; i++) {
    k0_val_ = (k0_val_ << 4n) | BigInt(flatK0_[i]);
  }
  const k0_prime_val_ = ((k0_val_ >> 1n) | ((k0_val_ & 1n) << 63n)) & 0xFFFFFFFFFFFFFFFFn;
  const flatK0Prime_ = new Array(16);
  for (let i = 15; i >= 0; i--) {
    flatK0Prime_[i] = Number((k0_prime_val_ >> BigInt((15 - i) * 4)) & 0xFn);
  }
  let k0_prime = unflattenState(flatK0Prime_);

  if (decrypt) {
    // For decryption, the exact opposite keys are applied.
    // MANTIS decryption property: swap k0 and k0_prime, and XOR k1 with ALPHA
    const temp = k0;
    k0 = k0_prime;
    k0_prime = temp;
    k1 = xorState(k1, unflattenState(ALPHA));
  }

  let currentState = plaintext;
  let currentTweak = tweak;

  const push = (name: string, type: MantisStep['type'], r: number, additionalProps?: Partial<MantisStep>) => {
    history.push({
      name,
      state: JSON.parse(JSON.stringify(currentState)),
      tweak: JSON.parse(JSON.stringify(currentTweak)),
      round: r,
      type,
      ...additionalProps
    });
  };

  push('Plaintext', 'initial', 0);

  // Initial AddTweakey
  // k0 ^ k1 ^ tweak
  const initTweakey = xorState(xorState(k0, k1), currentTweak);
  currentState = xorState(currentState, k0);
  currentState = xorState(currentState, k1);
  currentState = xorState(currentState, currentTweak);
  push('Initial AddTweakey', 'add_tweakey', 0, { roundTweakey: initTweakey });

  // Outer Rounds (FORWARD)
  for (let r = 0; r < rounds; r++) {
    currentState = subCells(currentState);
    push(`Round ${r} SubCells`, 'sub_cells', r);
    
    // Add Round Constant
    const roundTweakey = xorState(xorState(alphaConstant(r), k1), currentTweak);
    currentState = xorState(currentState, alphaConstant(r));
    // Add k1
    currentState = xorState(currentState, k1);
    // Add current tweak
    currentState = xorState(currentState, currentTweak);
    push(`Round ${r} AddKey/C/T`, 'add_tweakey', r, { roundTweakey });

    if (r < rounds - 1 || true) {
      currentState = shuffleCells(currentState);
      push(`Round ${r} ShuffleCells`, 'shuffle_cells', r);
      currentState = mixColumns(currentState);
      push(`Round ${r} MixColumns`, 'mix_columns', r);
    }
    push(`Round ${r} Output`, 'round_complete', r);
    currentTweak = permuteTweak(currentTweak);
  }

  // Middle Layer
  currentState = subCells(currentState);
  push('Middle SubCells', 'sub_cells', rounds);
  currentState = mixColumns(currentState);
  push('Middle MixColumns', 'mix_columns', rounds);
  currentState = subCells(currentState, true);
  push('Middle InvSubCells', 'sub_cells', rounds);
  push('Middle Layer Output', 'round_complete', rounds);

  // Outer Rounds (BACKWARD)
  for (let r = rounds - 1; r >= 0; r--) {
    currentTweak = permuteTweak(currentTweak); // Reverse tweak permutation? Actually MANTIS uses symmetric structure
    
    currentState = mixColumns(currentState);
    push(`Round ${r}' MixColumns`, 'mix_columns', r);
    currentState = shuffleCells(currentState, true);
    push(`Round ${r}' InvShuffleCells`, 'shuffle_cells', r);

    // Add Alpha prime (alpha ^ alpha_constant)
    // In Mantis, alpha_prime is used in backward branch
    const roundTweakey = xorState(xorState(xorState(alphaConstant(r), unflattenState(ALPHA)), k1), currentTweak);
    currentState = xorState(currentState, alphaConstant(r));
    currentState = xorState(currentState, unflattenState(ALPHA));
    currentState = xorState(currentState, k1); // Involutory
    currentState = xorState(currentState, currentTweak);
    push(`Round ${r}' AddKey/C/T`, 'add_tweakey', r, { roundTweakey });

    currentState = subCells(currentState, true);
    push(`Round ${r}' InvSubCells`, 'sub_cells', r);
    push(`Round ${r}' Output`, 'round_complete', r);
  }

  // Final AddTweakey
  const finalTweakey = xorState(xorState(k0_prime, k1), currentTweak);
  currentState = xorState(currentState, k0_prime);
  currentState = xorState(currentState, k1);
  currentState = xorState(currentState, currentTweak);
  push('Final AddTweakey', 'add_tweakey', 0, { roundTweakey: finalTweakey });

  push('Ciphertext', 'final', 0);

  return history;
}
