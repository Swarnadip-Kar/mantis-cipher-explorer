# DDT generation
import sys
sys.path.append('../implementations')
from mantis_base import *

print("S-box:")
print(SB0)

def build_ddt(sbox):
    size = len(sbox)
    ddt = [[0]*size for _ in range(size)]

    for dx in range(size):
        for x in range(size):
            x2 = x ^ dx

            dy = sbox[x] ^ sbox[x2]

            ddt[dx][dy] += 1

    return ddt

DDT = build_ddt(SB0)
#print(DDT)
print("DDT:")
print("",*[i for i in range(len(SB0))], sep="\t")
print("\t")
for dx in range(len(SB0)):
    print(dx, end="\t")
    for dy in range(len(SB0)):
        print(DDT[dx][dy], "\t", end="")
    print("\n")

print("Max values across rows/delta-x:")
print([max(DDT[i]) for i in range(len(SB0))])


