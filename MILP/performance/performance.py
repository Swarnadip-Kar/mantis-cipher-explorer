"""
Performs performance benchmarking and computational overhead analysis
for both the original MANTIS cipher and the proposed modified MANTIS
implementation.

The benchmarking framework evaluates the runtime efficiency of both
ciphers by measuring encryption latency and throughput over a large
number of randomly generated plaintext blocks.

The same key, tweak value, number of rounds, and iteration count are
used for both implementations to ensure a fair and consistent
comparison.

----------------------------------------------------------------------
PERFORMANCE METRICS
----------------------------------------------------------------------

The benchmark evaluates the following performance parameters:

    1. Total Encryption Time
    2. Average Encryption Time per Block
    3. Encryption Throughput
    4. Relative Computational Overhead

----------------------------------------------------------------------
BENCHMARK PROCEDURE
----------------------------------------------------------------------

For each cipher implementation:

    - A large set of random 64-bit plaintexts is generated
    - Each plaintext is encrypted sequentially
    - High-resolution timing is performed using:

        time.perf_counter()

The encryption process is repeated for a fixed number of iterations
to reduce timing noise and obtain stable measurements.

----------------------------------------------------------------------
TOTAL EXECUTION TIME
----------------------------------------------------------------------

The total encryption time represents the overall runtime required to
encrypt all plaintext blocks:

    T_total = T_end - T_start

where:

    T_start : starting timestamp
    T_end   : ending timestamp

This metric reflects the complete computational cost of the encryption
process for the selected workload.

----------------------------------------------------------------------
AVERAGE ENCRYPTION TIME
----------------------------------------------------------------------

The average encryption time per block is computed as:

    T_avg = T_total / N

where:

    N : total number of encryptions performed

The resulting value represents the average latency required to encrypt
a single 64-bit plaintext block.

For readability, the value is converted into microseconds per block:

    us/block

----------------------------------------------------------------------
THROUGHPUT
----------------------------------------------------------------------

The encryption throughput is calculated using:

    Throughput = N / T_total

where:

    N        : number of encrypted plaintext blocks
    T_total  : total execution time

This metric indicates the number of encryptions performed per second
and provides a direct measure of runtime efficiency.

----------------------------------------------------------------------
RELATIVE OVERHEAD
----------------------------------------------------------------------

To evaluate the additional computational cost introduced by the
proposed modifications, the relative overhead is computed as:

                T_novel - T_original
    Overhead = ---------------------- × 100
                    T_original

where:

    T_original : average encryption time of original MANTIS
    T_novel    : average encryption time of modified MANTIS

The resulting percentage indicates the increase in computational cost
introduced by the modified diffusion structure relative to the original
cipher.

----------------------------------------------------------------------
RESULT INTERPRETATION
----------------------------------------------------------------------

The benchmark results provide insight into the trade-off between:

    - Improved diffusion/security characteristics
    - Computational efficiency

A lower encryption time and higher throughput indicate better runtime
performance, while lower relative overhead indicates that the proposed
modifications preserve lightweight implementation characteristics.

The analysis therefore enables direct evaluation of whether the
improved diffusion behavior of the modified cipher is achieved with
acceptable computational cost.
"""

import sys
sys.path.append('../implementations')

import mantis_base
import mantis_novel
import time
import random


# ============================================================
# PERFORMANCE BENCHMARK
# ============================================================

def benchmark_cipher(cipher_func,
                     key,
                     tweak,
                     r=7,
                     iterations=100000):

    plaintexts = [
        random.getrandbits(64)
        for _ in range(iterations)
    ]

    # --------------------------------------------------------
    # START TIMER
    # --------------------------------------------------------

    start = time.perf_counter()

    for pt in plaintexts:
        cipher_func(pt, key, tweak, r)

    end = time.perf_counter()

    # --------------------------------------------------------
    # METRICS
    # --------------------------------------------------------

    total_time = end - start

    avg_time = total_time / iterations

    throughput = iterations / total_time

    return {
        "total_time": total_time,
        "avg_time": avg_time,
        "throughput": throughput
    }


# ============================================================
# RUN BENCHMARKS
# ============================================================

KEY   = 0x92F09952C625E3E9D7A060F714C0292B
TWEAK = 0xBA912E6F1055FED2

ITERATIONS = 100000


# ------------------------------------------------------------
# ORIGINAL MANTIS
# ------------------------------------------------------------

orig = benchmark_cipher(
    mantis_base.mantis_encrypt,
    KEY,
    TWEAK,
    r=7,
    iterations=ITERATIONS
)


# ------------------------------------------------------------
# NOVEL MANTIS
# ------------------------------------------------------------

nov = benchmark_cipher(
    mantis_novel.mantis_encrypt,
    KEY,
    TWEAK,
    r=7,
    iterations=ITERATIONS
)


# ============================================================
# RELATIVE OVERHEAD
# ============================================================

relative_overhead = (
    (nov["avg_time"] - orig["avg_time"])
    / orig["avg_time"]
) * 100


# ============================================================
# PRINT RESULTS
# ============================================================

print("=" * 72)
print("PERFORMANCE EVALUATION")
print("=" * 72)

print("\nOriginal MANTIS")
print("-" * 40)

print(f"Total Time          : {orig['total_time']:.6f} s")

print(f"Encryption Time     : "
      f"{orig['avg_time'] * 1e6:.4f} us/block")

print(f"Throughput          : "
      f"{orig['throughput']:.2f} encryptions/s")


print("\nNovel MANTIS")
print("-" * 40)

print(f"Total Time          : {nov['total_time']:.6f} s")

print(f"Encryption Time     : "
      f"{nov['avg_time'] * 1e6:.4f} us/block")

print(f"Throughput          : "
      f"{nov['throughput']:.2f} encryptions/s")


print("\nRelative Overhead")
print("-" * 40)

print(f"Overhead            : "
      f"{relative_overhead:.2f} %")

print("=" * 72)
