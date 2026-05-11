"""
Performs differential trail analysis for both the original and modified
MANTIS cipher implementations by observing the propagation of input
differences across internal cipher states.

The analysis encrypts two plaintexts differing by a small input
difference under the same key and tweak values. Internal states from
both encryptions are collected round-by-round using the trace-enabled
encryption functions. For each stage of encryption, the differential
state is computed using XOR:

    Δ = S1 ⊕ S2

where:
    S1 : internal state corresponding to plaintext P1
    S2 : internal state corresponding to plaintext P2
    Δ  : resulting differential state

The generated differential values are displayed in hexadecimal form,
along with the number of active nibbles at each stage. A nibble is
considered active if its differential value is non-zero.

This implementation enables visualization of how small input
differences propagate through the substitution, permutation, and
diffusion layers of the cipher, thereby providing experimental insight
into the avalanche and diffusion properties of both the original and
proposed MANTIS structures.

The same plaintexts, key, tweak, and round count are used for both
implementations to allow direct comparison of differential propagation
behavior.
"""

import sys
sys.path.append('../implementations')

import mantis_base
import mantis_novel

def differential_trail(trace_func,
                        pt1,
                        pt2,
                        key,
                        tweak,
                        r=7):

    t1 = trace_func(pt1, key, tweak, r)
    t2 = trace_func(pt2, key, tweak, r)

    print("=" * 80)
    print("DIFFERENTIAL TRAIL")
    print("=" * 80)

    for (name, s1), (_, s2) in zip(t1, t2):

        delta = [a ^ b for a, b in zip(s1, s2)]

        delta_hex = ''.join(f'{x:X}' for x in delta)

        active = sum(1 for x in delta if x != 0)

        print(f"{name:20s} | "
              f"Δ = {delta_hex} | "
              f"Active = {active}")

P1 = 0x0123456789ABCDEF
P2 = P1 ^ 0x1
KEY   = 0x92F09952C625E3E9D7A060F714C0292B
TWEAK = 0xBA912E6F1055FED2

differential_trail(
    mantis_base.mantis_encrypt_trace,
    P1,
    P2,
    KEY,
    TWEAK,
    r=7
)

differential_trail(
    mantis_novel.mantis_encrypt_trace,
    P1,
    P2,
    KEY,
    TWEAK,
    r=7
)
