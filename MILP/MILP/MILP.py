# MANTIS MILP Generator — Single-Key Model (nibble-level)
# MANTISr has 2r+2 S-box layers. MAX_ROUNDS default set to 8 (max rounds supported on original MANTIS).

MAX_ROUNDS = 8

for ROUNDS in range(1, MAX_ROUNDS+1):

    next_var  = 0
    next_aux  = 0
    lp_constraints = []
    sbox_vars = []   # all S-box activity variables (go in objective)

    def x_name(idx): return f"x{idx:03x}"   # state / intermediate variables
    def d_name(idx): return f"d{idx:03x}"   # XOR auxiliary variables

    def new_var():
        global next_var
        v = next_var; next_var += 1; return v

    def new_aux():
        global next_aux
        a = next_aux; next_aux += 1; return a

    def PermuteCells(state):
        """MANTIS PermuteCells: new_state[i] = old_state[P[i]]"""
        P = [0, 11, 6, 13, 10, 1, 12, 7, 5, 14, 3, 8, 15, 4, 9, 2]
        temp = [state[P[i]] for i in range(16)]
        for i in range(16): state[i] = temp[i]

    def InversePermuteCells(state):
        """Inverse PermuteCells for backward rounds"""
        # P_inv[j] = i  where  P[i] = j
        P_inv = [0, 5, 15, 10, 13, 8, 2, 7, 11, 14, 4, 1, 6, 3, 9, 12]
        temp = [state[P_inv[i]] for i in range(16)]
        for i in range(16): state[i] = temp[i]

    def MixColumns(state):
        for j in range(4):
            x0, x1 = state[j],     state[j + 4]
            x2, x3 = state[j + 8], state[j + 12]

            y0 = new_var()
            y1 = new_var()
            y2 = new_var()
            y3 = new_var()

            vars_all = [x0, x1, x2, x3, y0, y1, y2, y3]
            
            # 1. Create an Indicator Variable (d) for the column
            # d = 1 if the column is active, 0 if it is all zeros.
            d = new_aux()
            d_n = d_name(d)
            
            # 1. THE SAFETY FLOOR (Prevents Short-Circuiting)
            # Forces sum to be at least 4 if the column is used.
            sum_expr = " + ".join(x_name(v) for v in vars_all)
            lp_constraints.append(f"{sum_expr} - 4 {d_n} >= 0")
            for v in vars_all:
                lp_constraints.append(f"{d_n} - {x_name(v)} >= 0")

            # 2. THE SPECIFIC XOR LOGIC (Ensures valid "Variety")
            # For MANTIS/Midori: y0 = x1 + x2 + x3, etc.
            # These constraints ensure that the activity propagates 
            # according to the specific linear equations of the matrix.
            for out_v, in_group in [(y0,[x1,x2,x3]), (y1,[x0,x2,x3]), 
                                    (y2,[x0,x1,x3]), (y3,[x0,x1,x2])]:
                # If the output is active, at least one input must be active
                lp_constraints.append(f"{x_name(out_v)} - " + " - ".join(x_name(i) for i in in_group) + " <= 0")
                # If all inputs are inactive, the output must be inactive
                for i in in_group:
                    lp_constraints.append(f"{x_name(i)} - {d_n} <= 0") # already covered by floor logic

    def SboxLayer(state, label):
        """
        16 independent MIDORI Sb0 applications (one per nibble).
        At nibble level: activity variable a = in_activity = out_activity.
        Each `a` variable appears in the objective (counts active S-boxes).
        """
        for i in range(16):
            in_v  = state[i]
            out_v = new_var()
            state[i] = out_v
            a = f"a{label}_{i:02d}"
            sbox_vars.append(a)
            in_n, out_n = x_name(in_v), x_name(out_v)
            # a = input activity
            # input active iff S-box active
            lp_constraints.append(f"{in_n} - {a} <= 0")
            lp_constraints.append(f"{a} - {in_n} <= 0")

            # output active iff S-box active
            lp_constraints.append(f"{out_n} - {a} <= 0")
            lp_constraints.append(f"{a} - {out_n} <= 0")

    def generate_lp():
        global next_var, next_aux, lp_constraints, sbox_vars
        next_var = 0; next_aux = 0
        lp_constraints = []; sbox_vars = []

        r = ROUNDS
        # 16 initial nibble-activity variables (one per cell)
        state = [new_var() for _ in range(16)]

        # ── Forward half ──────────────
        for i in range(r):
            SboxLayer(state, f"F{i}")
            PermuteCells(state)
            MixColumns(state)
        SboxLayer(state, "Fm")  

        # ── Middle MixColumns ────────────────────────────
        MixColumns(state)

        # ── Backward half  ────────
        SboxLayer(state, "Bm")
        for i in range(r):
            MixColumns(state)
            InversePermuteCells(state)
            SboxLayer(state, f"B{i}")

        lines = ["Minimize"]
        lines.append(" + ".join(sbox_vars))
        lines.append("")
        lines.append("Subject To")

        # Non-trivial solution: at least one initial nibble is active
        init_sum = " + ".join(x_name(i) for i in range(16))
        lines.append(f"{init_sum} >= 1")

        lines.extend(lp_constraints)

        lines.append("Binary")
        for i in range(next_var):          # state & XOR intermediate variables
            lines.append(x_name(i))
        for sv in sbox_vars:               # S-box activity variables
            lines.append(sv)
        for i in range(next_aux):          # XOR auxiliary variables
            lines.append(d_name(i))

        lines.append("End")
        return "\n".join(lines)


    if __name__ == "__main__":
        lp_content = generate_lp()
        fname = f"mantis{ROUNDS}.lp"
        with open(fname, "w") as f:
            f.write(lp_content)

        total_sc_layers = 2 * ROUNDS + 2
        print(f"Generated {fname}")
        print(f"  S-box layers : {total_sc_layers}  ({ROUNDS}+1 forward + {ROUNDS}+1 backward)")
        print(f"  S-box vars   : {total_sc_layers * 16}")
        print(f"  State vars   : {next_var}")
        print(f"  XOR aux vars : {next_aux}")
