import type { Config } from "tailwindcss";
import { heroui } from "@heroui/theme";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Light theme colors
        light: {
          background: "#ffffff",
          foreground: "#171717",
          gray: "#6C6676",
        },
        // Dark theme colors
        dark: {
          default: "#1D1D2F",
          background: "#0a0a0a",
          foreground: "#ededed",
        },
        gray: {
          default: "#6C6676",
          white: "#A1A1AA",
        },
        input: {
          default: "#303047",
          enable: "#348EF7",
        },
        text: {
          default: "#E3EDF5",
          blue: "#016FEE",
        },
        // Custom colors
        custom: {
          "prediction-modal-button": "#6c66754d",
          "prediction-modal-bg": "#2F344E",
        },
      },
      backgroundImage: {
        mainImage: "url('/assets/images/background.jpg')",
      },
      fontFamily: {
        kodemono: ['Kode Mono', 'serif'],
      },
      fontSize: {
        'base-sm': '0.9375rem',    // 15px
        'base-md': '1rem',         // 16px
        'base-lg': '1.0625rem',    // 17px
      },
    },
  },
  darkMode: "class",
  plugins: [heroui({
    themes: {
      light: {
        colors: {
          background: "#ffffff",
          foreground: "#171717",
          primary: {
            DEFAULT: "#006FEE",
            foreground: "#ffffff",
          },
        },
      },
      dark: {
        colors: {
          background: "#0a0a0a",
          foreground: "#ededed",
          primary: {
            DEFAULT: "#006FEE",
            foreground: "#ffffff",
          },
        },
      },
    },
  })],
};
export default config;
