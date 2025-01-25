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
        },
        // Dark theme colors
        dark: {
          background: "#0a0a0a",
          foreground: "#ededed",
        }
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
