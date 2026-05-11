"""
Performs comparative diffusion and avalanche-effect analysis between
the original MANTIS cipher and the proposed modified MANTIS variant.

The implementation evaluates the diffusion capability of both ciphers
through multiple experimental metrics, including:

    1. Round-wise differential diffusion analysis
    2. Avalanche effect analysis
    3. Output difference distribution analysis
    4. Hamming weight statistical analysis

The same encryption key, tweak value, number of rounds, and input
difference are used for both implementations to ensure a consistent
and fair comparison.

----------------------------------------------------------------------
ROUND-WISE DIFFERENTIAL DIFFUSION ANALYSIS
----------------------------------------------------------------------

The round-wise diffusion analysis measures how rapidly input
differences propagate across the cipher state through successive
rounds and S-box layers.

For randomly generated plaintext pairs differing by a small input
difference, the implementation tracks the number of active S-boxes
at each stage of encryption. The average number of active S-boxes
is computed over multiple samples and plotted for both ciphers.

The differential diffusion improvement curve is additionally computed:

    Improvement = Novel - Original

which provides a direct visualization of the diffusion enhancement
introduced by the proposed design.

----------------------------------------------------------------------
AVALANCHE EFFECT ANALYSIS
----------------------------------------------------------------------

The avalanche effect analysis evaluates the sensitivity of the cipher
to small changes in the plaintext.

For each plaintext bit position:

    - A single plaintext bit is flipped
    - Both plaintexts are encrypted
    - The number of changed ciphertext bits is measured

The average number of changed ciphertext bits is then computed over
multiple trials. Ideally, a secure 64-bit block cipher should exhibit
an average avalanche close to 32 changed bits.

The implementation also computes statistical metrics including:

    - Mean avalanche value
    - Standard deviation

to evaluate the uniformity and consistency of diffusion behavior.

----------------------------------------------------------------------
OUTPUT DIFFERENCE DISTRIBUTION ANALYSIS
----------------------------------------------------------------------

To experimentally analyze differential propagation behavior, the code
generates ciphertext difference distributions using random plaintext
pairs.

For each sample:

    P2 = P1 ⊕ Δ

where Δ represents a fixed one-bit input difference.

The corresponding ciphertext differential is computed as:

    ΔC = C1 ⊕ C2

The Hamming weight of ΔC is then calculated:

    HW(ΔC)

where the Hamming weight represents the number of active bits in the
ciphertext difference.

Histograms of ciphertext difference Hamming weights are generated for:

    - Original MANTIS
    - Proposed modified MANTIS

to visualize the statistical diffusion characteristics of both
implementations.

----------------------------------------------------------------------
STATISTICAL EVALUATION
----------------------------------------------------------------------

The implementation computes:

    - Average ciphertext difference Hamming weight
    - Population standard deviation

for both ciphers.

A ciphertext difference distribution centered near half the block size
with relatively small standard deviation indicates stronger and more
uniform diffusion behavior.

----------------------------------------------------------------------
VISUALIZATION
----------------------------------------------------------------------

The following graphical comparisons are generated:

    - Round-wise differential diffusion comparison
    - Avalanche effect comparison
    - Differential diffusion improvement curve
    - Output difference Hamming weight histograms

These visualizations provide experimental insight into the diffusion
efficiency and avalanche characteristics of the proposed cipher design
relative to the original MANTIS structure.
"""

import sys
sys.path.append('../implementations')

import matplotlib.pyplot as plt
import statistics
import random
import mantis_base
import mantis_novel


KEY = 0x92F09952C625E3E9D7A060F714C0292B
TWEAK = 0xBA912E6F1055FED2

def hamming_weight(x):
    return bin(x).count("1")

# ORIGINAL RESULTS
orig_names, orig_avg = mantis_base.roundwise_diffusion_analysis(
    mantis_base.mantis_encrypt_trace,
    KEY,
    TWEAK,
    r=7,
    samples=200
)

# NOVEL RESULTS
nov_names, nov_avg = mantis_novel.roundwise_diffusion_analysis(
    mantis_novel.mantis_encrypt_trace,
    KEY,
    TWEAK,
    r=7,
    samples=200
)
diff_curve = [
    n - o for o, n in zip(orig_avg, nov_avg)
]

orig_overall_avg, orig_bit_avg = mantis_base.avalanche_analysis(mantis_base.mantis_encrypt, KEY, TWEAK)
nov_overall_avg, nov_bit_avg = mantis_novel.avalanche_analysis(mantis_novel.mantis_encrypt, KEY, TWEAK)

def output_difference_histogram_compare(
        orig_cipher,
        novel_cipher,
        key,
        tweak,
        r=7,
        samples=10000,
        input_difference=0x1):

    orig_hw = []
    nov_hw  = []

    # ========================================================
    # ORIGINAL MANTIS
    # ========================================================

    for _ in range(samples):

        p1 = random.getrandbits(64)
        p2 = p1 ^ input_difference

        c1 = orig_cipher(p1, key, tweak, r)
        c2 = orig_cipher(p2, key, tweak, r)

        diff = c1 ^ c2

        orig_hw.append(hamming_weight(diff))

    # ========================================================
    # NOVEL MANTIS
    # ========================================================

    for _ in range(samples):

        p1 = random.getrandbits(64)
        p2 = p1 ^ input_difference

        c1 = novel_cipher(p1, key, tweak, r)
        c2 = novel_cipher(p2, key, tweak, r)

        diff = c1 ^ c2

        nov_hw.append(hamming_weight(diff))

    # ========================================================
    # PLOT
    # ========================================================

    plt.figure(figsize=(12, 6))

    plt.hist(
        orig_hw,
        bins=30,
        alpha=0.6,
        label='Original MANTIS'
    )

    plt.xlabel("Ciphertext Difference Hamming Weight")

    plt.ylabel("Frequency")

    plt.title("Output Difference Distribution Comparison")

    plt.legend()

    plt.grid(True)

    plt.tight_layout()

    plt.savefig(
        "output_difference_histogram_comparison.png",
        dpi=300
    )

    plt.show()
    
    plt.figure(figsize=(12, 6))

    plt.hist(
        nov_hw,
        bins=30,
        alpha=0.6,
        label='Novel MANTIS'
    )

    plt.xlabel("Ciphertext Difference Hamming Weight")

    plt.ylabel("Frequency")

    plt.title("Output Difference Distribution Comparison")

    plt.legend()

    plt.grid(True)

    plt.tight_layout()

    plt.savefig(
        "output_difference_histogram_comparison.png",
        dpi=300
    )

    plt.show()


    # ========================================================
    # STATS
    # ========================================================

    print("\nOriginal MANTIS")
    print("---------------------------")
    print("Average HW:",
          statistics.mean(orig_hw))
    print("Std Dev:",
          statistics.pstdev(orig_hw))

    print("\nNovel MANTIS")
    print("---------------------------")
    print("Average HW:",
          statistics.mean(nov_hw))
    print("Std Dev:",
          statistics.pstdev(nov_hw))

    return orig_hw, nov_hw

output_difference_histogram_compare(
    mantis_base.mantis_encrypt,
    mantis_novel.mantis_encrypt,
    KEY,
    TWEAK,
    r=7,
    samples=10000,
    input_difference=0x1
)
# X-axis positions
x = list(range(1, len(orig_avg) + 1))

plt.figure(figsize=(10, 6))

plt.plot(x, orig_avg, marker='o', label='Original MANTIS')
plt.plot(x, nov_avg, marker='s', label='Novel MANTIS')

plt.xticks(x, orig_names, rotation=45)

plt.xlabel("Round / S-box Layer")
plt.ylabel("Average Active S-boxes")

plt.title("Round-wise Differential Diffusion Comparison")

plt.legend()

plt.grid(True)

plt.tight_layout()

plt.show()

x = list(range(64))


plt.figure(figsize=(12, 6))

plt.plot(
    x,
    orig_bit_avg,
    marker='o',
    label='Original MANTIS'
)

plt.plot(
    x,
    nov_bit_avg,
    marker='s',
    label='Novel MANTIS'
)

plt.xlabel("Flipped Plaintext Bit")

plt.ylabel("Average Changed Ciphertext Bits")

plt.title("Avalanche Effect Comparison")

plt.legend()

plt.grid(True)
plt.tight_layout()

plt.show()

x = list(range(1, len(diff_curve) + 1))

plt.figure(figsize=(10, 6))

plt.plot(
    x,
    diff_curve,
    marker='o'
)

plt.xticks(x, orig_names, rotation=45)

plt.axhline(0)

plt.xlabel("Round / S-box Layer")
plt.ylabel("Novel - Original Active S-boxes")

plt.title("Differential Diffusion Improvement")

plt.grid(True)

plt.tight_layout()

plt.show()

print("\nOriginal MANTIS")
print("-------------------------")
print("Average:",
      statistics.mean(orig_bit_avg))
print("Std Dev:",
      statistics.pstdev(orig_bit_avg))

print("\nNovel MANTIS")
print("-------------------------")
print("Average:",
      statistics.mean(nov_bit_avg))
print("Std Dev:",
      statistics.pstdev(nov_bit_avg))

