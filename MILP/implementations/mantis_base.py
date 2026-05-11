"""
MANTIS Block Cipher — Python implementation
Reference: "The SKINNY Family of Block Ciphers and its Low-Latency Variant MANTIS"
           Beierle et al., CRYPTO 2016  (Section 6)

Specification
─────────────
  Block size : 64 bits
  Key size   : 128 bits  →  k0 (upper 64 b) ‖ k1 (lower 64 b)
  Tweak size :  64 bits
  Variants   : MANTIS5 … MANTIS8  (r = half-round count)

α-reflection property
─────────────────────
  Dec_{(k0, k0', k1)}(·, T) = Enc_{(k0', k0, k1⊕α)}(·, T)
  so decryption is free given the encrypt implementation.
"""

# ── Constants (Section 6.1) ──────────────────────────────────────────────────

# Involutory 4-bit MIDORI Sbox Sb0 (Table 21)
#  x :  0     1     2     3     4     5     6     7
#        8     9     a     b     c     d     e     f
import random


SB0 = [0xC, 0xA, 0xD, 0x3, 0xE, 0xB, 0xF, 0x7,
       0x8, 0x9, 0x1, 0x5, 0x0, 0x2, 0x4, 0x6]

# Round constants RC_1 … RC_8  (Table 22, derived from digits of π)
RC = [
    0x13198A2E03707344,   # RC_1
    0xA4093822299F31D0,   # RC_2
    0x082EFA98EC4E6C89,   # RC_3
    0x452821E638D01377,   # RC_4
    0xBE5466CF34E90C6C,   # RC_5
    0xC0AC29B7C97C50DD,   # RC_6
    0x3F84D5B5B5470917,   # RC_7
    0x9216D5D98979FB1B,   # RC_8
]

# α constant (also from π digits; see AddRoundTweakey and final whitening)
ALPHA = 0x243F6A8885A308D3

# MIDORI cell permutation P  (PermuteCells)
P_FWD = [0, 11,  6, 13, 10,  1, 12,  7,  5, 14,  3,  8, 15,  4,  9,  2]

# Inverse permutation P⁻¹  (computed once at module load)
P_INV = [0] * 16
for _i, _v in enumerate(P_FWD):
    P_INV[_v] = _i

# Tweak permutation h;  h(T)[i] = T[ H_PERM[i] ]
H_PERM = [6, 5, 14, 15, 0, 1, 2, 3, 7, 12, 13, 4, 8, 9, 10, 11]

# MIDORI MixColumns binary matrix M  (involutory over GF(2): M² = I)
M_MAT = [[0, 1, 1, 1],
         [1, 0, 1, 1],
         [1, 1, 0, 1],
         [1, 1, 1, 0]]

# ── Low-level helpers ────────────────────────────────────────────────────────
def hamming_weight(x: int) -> int:
    return bin(x).count("1")

def _to_nib(x: int) -> list:
    """64-bit integer → 16 nibbles, MSB nibble first."""
    return [(x >> (60 - 4 * i)) & 0xF for i in range(16)]

def _from_nib(n: list) -> int:
    """16 nibbles → 64-bit integer."""
    r = 0
    for v in n:
        r = (r << 4) | (v & 0xF)
    return r

def _ror64(x: int, n: int) -> int:
    """64-bit right rotation."""
    return ((x >> n) | (x << (64 - n))) & 0xFFFF_FFFF_FFFF_FFFF

# ── Cipher layer functions ───────────────────────────────────────────────────

def _sub_cells(s):
    """Apply involutory MIDORI Sbox Sb0 to every nibble."""
    return [SB0[x] for x in s]

def _add_constant(s, rc):
    """XOR 64-bit round constant (row-wise) into the state."""
    rc_nib = _to_nib(rc)
    return [s[i] ^ rc_nib[i] for i in range(16)]

def _add_tweakey(s, tk):
    """XOR the tweakey nibble-list into the state."""
    return [s[i] ^ tk[i] for i in range(16)]

def _permute_cells(s, perm):
    """Rearrange the 16 state nibbles using the supplied permutation."""
    return [s[perm[i]] for i in range(16)]

def _mix_columns(s):
    """
    MixColumns: multiply each column by binary matrix M over GF(2).
    M is involutory, so M⁻¹ = M.
    State layout: s[row*4 + col], rows and columns in [0, 3].
    """
    out = [0] * 16
    for col in range(4):
        c = [s[row * 4 + col] for row in range(4)]
        for row in range(4):
            v = 0
            for k in range(4):
                if M_MAT[row][k]:
                    v ^= c[k]
            out[row * 4 + col] = v
    return out

def _apply_h(T):
    """Apply tweak permutation h once:  h(T)[i] = T[ H_PERM[i] ]."""
    return [T[H_PERM[i]] for i in range(16)]

# ── Round functions ──────────────────────────────────────────────────────────

def _fwd_round(s, tk, rc):
    """
    Forward round Rᵢ (Section 6.1):
      SubCells → AddConstant → AddTweakey → PermuteCells → MixColumns
    """
    s = _sub_cells(s)
    s = _add_constant(s, rc)
    s = _add_tweakey(s, tk)
    s = _permute_cells(s, P_FWD)
    s = _mix_columns(s)
    return s

def _inv_round(s, tk, rc):
    """
    Inverse round Rᵢ⁻¹:
      MixColumns⁻¹ → PermuteCells⁻¹ → AddTweakey → AddConstant → SubCells⁻¹

    All components are self-inverse (XOR layers) or use the involutory / inverse
    form of their forward counterpart.
    """
    s = _mix_columns(s)            # M⁻¹ = M  (involutory)
    s = _permute_cells(s, P_INV)   # P⁻¹
    s = _add_tweakey(s, tk)        # self-inverse
    s = _add_constant(s, rc)       # self-inverse
    s = _sub_cells(s)              # Sb0⁻¹ = Sb0  (involutory)
    return s

def _inv_round_trace(s, tk, rc, traces, i):
    """
    Inverse round Rᵢ⁻¹:
      MixColumns⁻¹ → PermuteCells⁻¹ → AddTweakey → AddConstant → SubCells⁻¹

    All components are self-inverse (XOR layers) or use the involutory / inverse
    form of their forward counterpart.
    """
    s = _mix_columns(s)            # M⁻¹ = M  (involutory)
    s = _permute_cells(s, P_INV)   # P⁻¹
    s = _add_tweakey(s, tk)        # self-inverse
    s = _add_constant(s, rc)       # self-inverse
    traces.append((f"BWD_SBOX_{i}", s.copy()))
    s = _sub_cells(s)              # Sb0⁻¹ = Sb0  (involutory)
    return s


# ── Public API ───────────────────────────────────────────────────────────────

def mantis_encrypt(plaintext: int, key: int, tweak: int, r: int = 7) -> int:
    """
    Encrypt one 64-bit block with MANTIS_r.

    Full cipher structure (Figure 13 / Section 6.1):

        [initial whitening]                 state ⊕= k0 ⊕ k1 ⊕ T
        H_r forward half       R₁(h¹T⊕k₁) … Rᵣ(hʳT⊕k₁)  →  SubCells
        Middle layer           MixColumns
        H_r⁻¹ backward half   SubCells  →  Rᵣ⁻¹(hʳT⊕k̄₁) … R₁⁻¹(h¹T⊕k̄₁)
        [final whitening]                   state ⊕= k0' ⊕ k1 ⊕ α ⊕ T

    Parameters
    ----------
    plaintext : 64-bit integer
    key       : 128-bit integer  (k0 = upper 64 b, k1 = lower 64 b)
    tweak     : 64-bit integer
    r         : half-round count — 5 (MANTIS5) … 8 (MANTIS8); default 7

    Returns
    -------
    64-bit ciphertext integer
    """
    if not (1 <= r <= 8):
        raise ValueError(f"r must be 1–8, got {r}")

    # ── Key schedule ──────────────────────────────────────────────────────────
    k0     = (key >> 64) & 0xFFFF_FFFF_FFFF_FFFF
    k1     = key         & 0xFFFF_FFFF_FFFF_FFFF
    k0p    = _ror64(k0, 1)^(k0 >> 63)          # k0' = (k0 >> 1) ⊕ (k0 << 63)  [≡ ROR₆₄(k0, 1)]
    kbar1  = k1 ^ ALPHA             # k̄₁  = k1 ⊕ α

    k0_n   = _to_nib(k0)
    k1_n   = _to_nib(k1)
    k0p_n  = _to_nib(k0p)
    kb1_n  = _to_nib(kbar1)
    alp_n  = _to_nib(ALPHA)

    # ── State and tweak ───────────────────────────────────────────────────────
    s = _to_nib(plaintext)
    T = _to_nib(tweak)

    # Precompute h¹(T), h²(T), …, hʳ(T)
    hp = [T]
    for _ in range(r):
        hp.append(_apply_h(hp[-1]))          # hp[i] = hⁱ(T)

    # ── Initial whitening:  s ⊕= k0 ⊕ k1 ⊕ T ────────────────────────────────
    s = [s[i] ^ k0_n[i] ^ k1_n[i] ^ T[i] for i in range(16)]

    # ── Forward half  H_r :  R₁ … Rᵣ,  then  SubCells ───────────────────────
    for i in range(1, r + 1):
        tk = [hp[i][j] ^ k1_n[j] for j in range(16)]
        s  = _fwd_round(s, tk, RC[i - 1])
    s = _sub_cells(s)                                # closing SubCells of H_r

    # ── Middle layer:  MixColumns ─────────────────────────────────────────────
    s = _mix_columns(s)

    # ── Backward half  H_r⁻¹ :  SubCells,  then  Rᵣ⁻¹ … R₁⁻¹ ───────────────
    s = _sub_cells(s)                                # opening SubCells of H_r⁻¹
    for i in range(r, 0, -1):
        tk = [hp[i][j] ^ kb1_n[j] for j in range(16)]
        s  = _inv_round(s, tk, RC[i - 1])

    # ── Final whitening:  s ⊕= k0' ⊕ k1 ⊕ α ⊕ T ─────────────────────────────
    s = [s[i] ^ k0p_n[i] ^ k1_n[i] ^ alp_n[i] ^ T[i] for i in range(16)]

    return _from_nib(s)


def mantis_decrypt(ciphertext: int, key: int, tweak: int, r: int = 7) -> int:
    """
    Decrypt one 64-bit block with MANTIS_r.

    Exploits the α-reflection property (Section 6.1):

        Dec_{(k0, k0', k1)}(·, T) = Enc_{(k0', k0, k1⊕α)}(·, T)

    Substituting the swapped triple into the encrypt formula:
        new k0  = k0'        →  initial whitening:  k0' ⊕ (k1⊕α) ⊕ T
        new k0' = k0         →  final   whitening:  k0  ⊕ (k1⊕α) ⊕ α ⊕ T = k0 ⊕ k1 ⊕ T
        new k1  = k1 ⊕ α    →  forward rounds use  k1⊕α
                               backward rounds use  (k1⊕α)⊕α = k1

    Parameters
    ----------
    ciphertext : 64-bit integer
    key        : 128-bit integer  (same key as used for encryption)
    tweak      : 64-bit integer
    r          : half-round count (must match encryption)

    Returns
    -------
    64-bit plaintext integer
    """
    if not (1 <= r <= 8):
        raise ValueError(f"r must be 1–8, got {r}")

    k0  = (key >> 64) & 0xFFFF_FFFF_FFFF_FFFF
    k1  = key         & 0xFFFF_FFFF_FFFF_FFFF
    k0p = _ror64(k0, 1)^(k0 >> 63)

    k0_n  = _to_nib(k0)
    k0p_n = _to_nib(k0p)
    k1_n  = _to_nib(k1)
    kb1_n = _to_nib(k1 ^ ALPHA)   # new k1 for decryption = k1 ⊕ α

    s = _to_nib(ciphertext)
    T = _to_nib(tweak)

    hp = [T]
    for _ in range(r):
        hp.append(_apply_h(hp[-1]))

    # Initial whitening with new_k0=k0', new_k1=k1⊕α:
    #   s ⊕= k0' ⊕ (k1⊕α) ⊕ T
    s = [s[i] ^ k0p_n[i] ^ kb1_n[i] ^ T[i] for i in range(16)]

    # Forward rounds with new_k1 = k1 ⊕ α
    for i in range(1, r + 1):
        tk = [hp[i][j] ^ kb1_n[j] for j in range(16)]
        s  = _fwd_round(s, tk, RC[i - 1])
    s = _sub_cells(s)

    s = _mix_columns(s)

    # Backward rounds with new_k̄1 = (k1⊕α) ⊕ α = k1
    s = _sub_cells(s)
    for i in range(r, 0, -1):
        tk = [hp[i][j] ^ k1_n[j] for j in range(16)]
        s  = _inv_round(s, tk, RC[i - 1])

    # Final whitening: new_k0' ⊕ new_k1 ⊕ α ⊕ T
    #                = k0 ⊕ (k1⊕α) ⊕ α ⊕ T  =  k0 ⊕ k1 ⊕ T
    s = [s[i] ^ k0_n[i] ^ k1_n[i] ^ T[i] for i in range(16)]

    return _from_nib(s)

def mantis_encrypt_trace(plaintext: int, key: int, tweak: int, r: int = 7) -> int:
    """
    Encrypt one 64-bit block with MANTIS_r.

    Full cipher structure (Figure 13 / Section 6.1):

        [initial whitening]                 state ⊕= k0 ⊕ k1 ⊕ T
        H_r forward half       R₁(h¹T⊕k₁) … Rᵣ(hʳT⊕k₁)  →  SubCells
        Middle layer           MixColumns
        H_r⁻¹ backward half   SubCells  →  Rᵣ⁻¹(hʳT⊕k̄₁) … R₁⁻¹(h¹T⊕k̄₁)
        [final whitening]                   state ⊕= k0' ⊕ k1 ⊕ α ⊕ T

    Parameters
    ----------
    plaintext : 64-bit integer
    key       : 128-bit integer  (k0 = upper 64 b, k1 = lower 64 b)
    tweak     : 64-bit integer
    r         : half-round count — 5 (MANTIS5) … 8 (MANTIS8); default 7

    Returns
    -------
    64-bit ciphertext integer
    """
    if not (1 <= r <= 8):
        raise ValueError(f"r must be 1–8, got {r}")

    # ── Key schedule ──────────────────────────────────────────────────────────
    k0     = (key >> 64) & 0xFFFF_FFFF_FFFF_FFFF
    k1     = key         & 0xFFFF_FFFF_FFFF_FFFF
    k0p    = _ror64(k0, 1)^(k0 >> 63)          # k0' = (k0 >> 1) ⊕ (k0 << 63)  [≡ ROR₆₄(k0, 1)]
    kbar1  = k1 ^ ALPHA             # k̄₁  = k1 ⊕ α

    k0_n   = _to_nib(k0)
    k1_n   = _to_nib(k1)
    k0p_n  = _to_nib(k0p)
    kb1_n  = _to_nib(kbar1)
    alp_n  = _to_nib(ALPHA)

    # ── State and tweak ───────────────────────────────────────────────────────
    s = _to_nib(plaintext)
    T = _to_nib(tweak)

    # Precompute h¹(T), h²(T), …, hʳ(T)
    hp = [T]
    for _ in range(r):
        hp.append(_apply_h(hp[-1]))          # hp[i] = hⁱ(T)

    traces = []

    # ── Initial whitening:  s ⊕= k0 ⊕ k1 ⊕ T ────────────────────────────────
    s = [s[i] ^ k0_n[i] ^ k1_n[i] ^ T[i] for i in range(16)]

    # ── Forward half  H_r :  R₁ … Rᵣ,  then  SubCells ───────────────────────
    for i in range(1, r + 1):
        traces.append((f"FWD_SBOX_{i}", s.copy()))
        tk = [hp[i][j] ^ k1_n[j] for j in range(16)]
        s  = _fwd_round(s, tk, RC[i - 1])
    
    traces.append(("MID_SBOX_1", s.copy()))
    s = _sub_cells(s)                                # closing SubCells of H_r

    # ── Middle layer:  MixColumns ─────────────────────────────────────────────
    s = _mix_columns(s)

    # ── Backward half  H_r⁻¹ :  SubCells,  then  Rᵣ⁻¹ … R₁⁻¹ ───────────────
    traces.append(("MID_SBOX_2", s.copy()))
    s = _sub_cells(s)                                # opening SubCells of H_r⁻¹
    for i in range(r, 0, -1):
        tk = [hp[i][j] ^ kb1_n[j] for j in range(16)]
        s  = _inv_round_trace(s, tk, RC[i - 1], traces, i)

    # ── Final whitening:  s ⊕= k0' ⊕ k1 ⊕ α ⊕ T ─────────────────────────────
    s = [s[i] ^ k0p_n[i] ^ k1_n[i] ^ alp_n[i] ^ T[i] for i in range(16)]

    return traces

def active_sbox_analysis(pt1, pt2, key, tweak, r=7):

    t1 = mantis_encrypt_trace(pt1, key, tweak, r)
    t2 = mantis_encrypt_trace(pt2, key, tweak, r)

    print("=" * 72)
    print("ACTIVE S-BOX ANALYSIS")
    print("=" * 72)

    total_active = 0

    for (name1, s1), (_, s2) in zip(t1, t2):

        # Difference entering S-box layer
        delta = [a ^ b for a, b in zip(s1, s2)]

        # Count active S-boxes
        active = sum(1 for x in delta if x != 0)

        total_active += active

        print(f"{name1:20s} | Active S-boxes = {active:2d}")

    print("=" * 72)
    print(f"TOTAL ACTIVE S-BOXES = {total_active}")
    print("=" * 72)

def avalanche_analysis(cipher_func,
                        key: int,
                        tweak: int,
                        r: int = 7,
                        samples: int = 1000):

    print("=" * 72)
    print("AVALANCHE ANALYSIS")
    print("=" * 72)

    total_hw = 0
    total_tests = 0

    # Per-bit statistics
    bit_averages = [0] * 64

    for bit in range(64):

        bit_total = 0

        for _ in range(samples):

            # Random plaintext
            p1 = random.getrandbits(64)

            # Flip ONE bit
            p2 = p1 ^ (1 << bit)

            # Encrypt both
            c1 = cipher_func(p1, key, tweak, r)
            c2 = cipher_func(p2, key, tweak, r)

            # Ciphertext difference
            diff = c1 ^ c2

            # Count changed bits
            hw = hamming_weight(diff)

            bit_total += hw
            total_hw += hw
            total_tests += 1

        avg = bit_total / samples
        bit_averages[bit] = avg

        print(f"Input bit {bit:2d} -> Avg changed ciphertext bits = {avg:.2f}")

    overall_avg = total_hw / total_tests

    print("=" * 72)
    print(f"OVERALL AVERAGE AVALANCHE = {overall_avg:.4f} bits")
    print("=" * 72)

    return overall_avg, bit_averages

def roundwise_diffusion_analysis(
        trace_func,
        key,
        tweak,
        r=7,
        samples=200):

    """
    Measures average active S-boxes per layer
    across many plaintext pairs.
    """

    # Number of S-box layers:
    # forward r
    # middle 2
    # backward r
    total_layers = 2 * r + 2

    layer_totals = [0] * total_layers
    layer_names = None

    total_tests = 0

    for _ in range(samples):

        # Random plaintext
        p1 = random.getrandbits(64)

        # Test ALL single-bit differences
        for bit in range(64):

            p2 = p1 ^ (1 << bit)

            t1 = trace_func(p1, key, tweak, r)
            t2 = trace_func(p2, key, tweak, r)

            if layer_names is None:
                layer_names = [name for name, _ in t1]

            for idx, ((_, s1), (_, s2)) in enumerate(zip(t1, t2)):

                delta = [a ^ b for a, b in zip(s1, s2)]

                active = sum(1 for x in delta if x != 0)

                layer_totals[idx] += active

            total_tests += 1

    averages = [x / total_tests for x in layer_totals]

    print("=" * 72)
    print("ROUND-WISE DIFFUSION ANALYSIS")
    print("=" * 72)

    for name, avg in zip(layer_names, averages):
        print(f"{name:20s} | Avg active S-boxes = {avg:.4f}")

    print("=" * 72)

    return layer_names, averages

# ── Test vectors (Appendix B.2) ──────────────────────────────────────────────

if __name__ == "__main__":
    KEY   = 0x92F09952C625E3E9D7A060F714C0292B
    TWEAK = 0xBA912E6F1055FED2

    # (r, plaintext, expected_ciphertext)
    VECTORS = [
        (5, 0x3B5C77A4921F9718, 0xD6522035C1C0C6C1),
        (6, 0xD6522035C1C0C6C1, 0x60E43457311936FD),
        (7, 0x60E43457311936FD, 0x308E8A07F168F517),
        (8, 0x308E8A07F168F517, 0x971EA01A86B410BB),
    ]

    print("=" * 68)
    print("  MANTIS cipher — test vectors from Appendix B.2")
    print("=" * 68)
    print(f"  Key  : 0x{KEY:032X}")
    print(f"  Tweak: 0x{TWEAK:016X}")
    print("=" * 68)

    all_ok = True
    for r, pt, exp_ct in VECTORS:
        ct  = mantis_encrypt(pt,  KEY, TWEAK, r)
        rec = mantis_decrypt(ct,  KEY, TWEAK, r)
        enc_ok = ct  == exp_ct
        dec_ok = rec == pt
        ok     = enc_ok and dec_ok
        all_ok = all_ok and ok

        tag = "PASS ✓" if ok else "FAIL ✗"
        print(f"\n  MANTIS{r}  [{tag}]")
        print(f"    Plaintext  : 0x{pt:016X}")
        print(f"    Ciphertext : 0x{ct:016X}"
              f"  {'✓' if enc_ok else '✗ expected 0x' + f'{exp_ct:016X}'}")
        print(f"    Recovered  : 0x{rec:016X}  {'✓' if dec_ok else '✗'}")

    print("\n" + "=" * 68)
    print(f"  {'All tests PASSED ✓' if all_ok else 'SOME TESTS FAILED ✗'}")
    print("=" * 68)

    KEY   = 0x92F09952C625E3E9D7A060F714C0292B
    TWEAK = 0xBA912E6F1055FED2

    P1 = 0x0123456789ABCDEF

    # single-bit difference
    P2 = P1 ^ 0x0000000000000001

    active_sbox_analysis(P1, P2, KEY, TWEAK, r=7)
    avalanche_analysis(
    mantis_encrypt,
    KEY,
    TWEAK,
    r=7,
    samples=1000
    )

    roundwise_diffusion_analysis(
    mantis_encrypt_trace,
    KEY,
    TWEAK,
    r=7,
    samples=200
    )
