# Comparing trails taken by both ciphers (original and novel) on given key and tweak and plaintext pair
import sys
sys.path.append('../implementations')

import mantis_base
import mantis_novel

KEY = 0x92F09952C625E3E9D7A060F714C0292B
TWEAK = 0xBA912E6F1055FED2

P1 = 0x0123456789ABCDEF
P2 = P1 ^ 0x0000000000000001

print("Base Mantis:")
mantis_base.active_sbox_analysis(P1, P2, KEY, TWEAK)

print("Novel Mantis:")
mantis_novel.active_sbox_analysis(P1, P2, KEY, TWEAK)
