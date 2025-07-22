'use client';

import { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    loadPyodide: any;
  }
}

interface PyodideInstance {
  runPython: (code: string) => any;
  globals: any;
  registerJsModule: (name: string, module: any) => void;
  unpackArchive: (buffer: ArrayBuffer, format: string) => void;
  loadPackage: (packages: string | string[]) => Promise<void>;
  canvas: any;
}

export function usePyodide() {
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function loadPyodideEnvironment() {
      try {
        setIsLoading(true);
        setError(null);

        // Load Pyodide from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js';
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        // Initialize Pyodide
        const pyodideInstance = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
        });

        // Load essential packages for data science
        console.log('Loading Python packages...');
        await pyodideInstance.loadPackage([
          'pandas', 
          'numpy', 
          'matplotlib', 
          'scipy',
          'micropip'
        ]);

        // Try to install additional packages that might not be in the core Pyodide distribution
        console.log('Installing additional packages via micropip...');
        try {
          await pyodideInstance.runPythonAsync(`
            import micropip
            await micropip.install(['seaborn', 'plotly'])
            print("Successfully installed seaborn and plotly")
          `);
        } catch (error) {
          console.log('Note: Could not install some additional packages:', error);
          pyodideInstance.runPython(`
            print("Note: Advanced packages not available, but core data science packages are ready")
          `);
        }

        // Set up matplotlib for web
        pyodideInstance.runPython(`
          import matplotlib
          matplotlib.use('Agg')  # Use non-interactive backend
          import matplotlib.pyplot as plt
          import pandas as pd
          import numpy as np
          import warnings
          warnings.filterwarnings('ignore')
          
          # Set up plotting
          plt.ioff()  # Turn off interactive mode
          
          # Try to import seaborn if available
          try:
            import seaborn as sns
            sns.set_style("whitegrid")
            print("Python environment ready with data science packages including seaborn!")
          except ImportError:
            print("Python environment ready with core data science packages!")
            print("Note: seaborn not available, but pandas, numpy, matplotlib, and scipy are ready")
        `);

        setPyodide(pyodideInstance);
        console.log('Pyodide loaded successfully');
      } catch (err) {
        console.error('Failed to load Pyodide:', err);
        setError(`Failed to load Python environment: ${err}`);
      } finally {
        setIsLoading(false);
      }
    }

    loadPyodideEnvironment();
  }, []);

  return { pyodide, isLoading, error };
} 