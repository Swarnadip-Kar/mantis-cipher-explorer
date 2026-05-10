# Mantis Cipher Explorer

A high-performance, interactive 3D simulation and analysis tool for the Mantis block cipher. Built with React and React Three Fiber, this tool provides a mathematically accurate visualization of the cryptographic primitives defined in the official CRYPTO 2016 specification.

## Academic Context

This simulation was developed as a project for the **CSL505 Cryptography** course at the **Indian Institute of Technology Bhilai (IIT Bhilai)** during the **Winter 2026** term.

- **Professor:** Dr. Dhiman Saha, IIT Bhilai
- **Simulation By:** Swarnadip Kar - IIT Bhilai BTech CSE 2027 Batch

## Features

- **Interactive 3D Simulation**: Step-by-step 3D visualization of the cipher's internal state matrix during encryption and decryption.
- **Cryptographic Accuracy**: Strictly adheres to the Mantis specification, accurately modeling operations including SubCells, MixColumns, AddTweakey, and ShuffleCells.
- **Configurable Parameters**: Support for variable round counts (MANTIS-5 through MANTIS-8, and more) and customizable inputs (Plaintext, Key 0, Key 1, Tweak).
- **Advanced Cryptanalysis Tools**:
  - **Differential Attack Analysis**: Track the propagation of differences through the cipher rounds.
  - **Integral Attack Analysis**: Analyze structural properties and zero-sum distinctions.
- **Premium UI/UX**: Dark-themed, highly responsive interface with detailed operation tracking and smooth animations.

## Technologies Used

- React 19
- React Three Fiber & Drei (3D rendering)
- Tailwind CSS & Framer Motion (Styling and UI animations)
- Vite (Build tool)
- TypeScript

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd mantis-cipher-explorer
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

### Running the Web Interface

Start the development server:
```bash
npm run dev
```

Open your browser and navigate to the local URL provided by Vite (typically `http://localhost:3000`).

To build for production:
```bash
npm run build
```

### Running the CLI Test Suite

You can run the core cryptographic logic tests directly via the command line using `tsx`:
```bash
npx tsx run.ts
```
This will run the predefined test vectors and output the resulting ciphertexts to the console.

## Project Structure

- `src/App.tsx`: Main application shell, routing, and 3D simulation context.
- `src/lib/mantis.ts`: Core cryptographic logic and mathematical implementation of the Mantis cipher.
- `src/DifferentialAttackTab.tsx`: Component for differential cryptanalysis visualization.
- `src/IntegralAttackTab.tsx`: Component for integral cryptanalysis visualization.
- `src/index.css`: Global styles and Tailwind configuration.
