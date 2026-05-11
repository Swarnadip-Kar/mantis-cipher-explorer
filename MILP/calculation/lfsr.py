#LFSR working and generation

def lfsr64(rc):
    feedback = (
        ((rc >> 63) ^
         (rc >> 3)  ^
         (rc >> 2)  ^
         (rc >> 0)) & 1
    )

    rc = ((rc << 1) & 0xFFFF_FFFF_FFFF_FFFF) | feedback
    return rc

KEY   = 0x92F09952C625E3E9D7A060F714C0292B
TWEAK = 0xBA912E6F1055FED2

k0     = (KEY >> 64) & 0xFFFF_FFFF_FFFF_FFFF
r0 = k0 ^ TWEAK

temp_r = r0
for i in range(100):
    print(temp_r)
    temp_r = lfsr64(temp_r)
