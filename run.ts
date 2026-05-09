import { mantisCipher, flattenState, createEmptyState } from './src/lib/mantis.ts';

function toState(val) {
  const s = createEmptyState();
  for (let i = 0; i < 16; i++) {
    s[Math.floor(i / 4)][i % 4] = Number((val >> BigInt((15 - i) * 4)) & 0xFn);
  }
  return s;
}

function fromState(s) {
  let val = 0n;
  for (let i = 0; i < 16; i++) {
    val = (val << 4n) | BigInt(s[Math.floor(i / 4)][i % 4]);
  }
  return val;
}

function unflatten(flat) {
  const res = createEmptyState();
  flat.forEach((v, i) => (res[Math.floor(i / 4)][i % 4] = v));
  return res;
}

function runTest(rounds, plaintextHex, k0Hex, k1Hex, tweakHex) {
  const T = unflatten(tweakHex.split('').map(c => parseInt(c, 16)));
  const P = unflatten(plaintextHex.split('').map(c => parseInt(c, 16)));
  const K0 = unflatten(k0Hex.split('').map(c => parseInt(c, 16)));
  const K1 = unflatten(k1Hex.split('').map(c => parseInt(c, 16)));

  const history = mantisCipher(P, K0, K1, T, false, rounds);
  const outState = history[history.length - 1].state;
  let outHex = flattenState(outState).map(n => n.toString(16)).join('');
  console.log(`MANTIS-${rounds} Output:`, outHex);
}

runTest(5, "3b5c77a4921f9718", "92f09952c625e3e9", "d7a060f714c0292b", "ba912e6f1055fed2");
runTest(6, "d6522035c1c0c6c1", "92f09952c625e3e9", "d7a060f714c0292b", "ba912e6f1055fed2");
runTest(7, "60e43457311936fd", "92f09952c625e3e9", "d7a060f714c0292b", "ba912e6f1055fed2");
