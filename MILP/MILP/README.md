# MANTIS MILP Active S-Box Analysis

This project implements a Mixed Integer Linear Programming (MILP)-based active S-box analysis for the MANTIS lightweight block cipher under the Single-Key (SK) model.

The implementation estimates the minimum number of active S-boxes across multiple rounds using binary activity propagation constraints and branch-number-inspired diffusion modeling.

The MILP model is solved using the Gurobi Optimizer.

---

# Features

- Active S-box minimization using MILP
- Support for multiple rounds
- MANTIS permutation and MixColumns modeling
- Reflection-based forward and backward round structure
- LP file generation compatible with Gurobi
- Automatic extraction of active S-box lower bounds

---

# Requirements

The following software must be installed:

- Python 3.x
- Gurobi Optimizer
- gurobipy Python package

---

# Checking Gurobi Installation

Run:

```bash
python -c "import gurobipy; print(gurobipy.gurobi.version())"
```

If installed correctly, the version number will be displayed.

Example:

```bash
(13, 0, 2)
```

# Running the program

Generate the LP model:

```bash
python MILP.py
```

This generates:

```bash
mantis1.lp
mantis2.lp
mantis3.lp
mantis4.lp
mantis5.lp
mantis6.lp
mantis7.lp
mantis8.lp
```

Above files are generated LP files for each half-round of MANTIS (r = 1-8).

# Solving the MILP Model

Run Gurobi on the generated LP file to see the result:

```bash
gurobi_cl mantis1.lp
```

or to see the detailed assignment of values to variables:

```bash
gurobi_cl ResultFile=solution.sol mantis1.lp
```

This produces:

- optimization output in terminal
- solution file: solution.sol

Do for each round.

# Understanding the Output

The objective value corresponds to:

```bash
Minimum number of active S-boxes
```

Example:

```bash
Best objective 6.000000000000e+00
```

means

```bash
Minimum active S-boxes = 6
```

# Variable Naming Convention

## State Variables
```bash
x###
```

Binary activity variables representing internal state nibbles.

Example:
```bash
x02f
```

## S-box Variables

```bash
aF#
aFm
aBm
aB#
```

Where:

- F : forward rounds
- Fm : forward-middle layer
- Bm : backward-middle layer
- B : backward rounds

Example:
```bash
aF1_06
```

means:
```bash
S-box 6 active in forward round 1
```

## Diffusion Variables
```bash
d###
```

Auxiliary binary variables representing active MixColumns branches.

# Important Note

This implementation performs:
Activity-based MILP relaxation

and does NOT compute:

- exact differential characteristics
- exact differential probabilities

The obtained values therefore represent:

```bash
Estimated lower bounds on active S-boxes
```

rather than exact differential trails.




