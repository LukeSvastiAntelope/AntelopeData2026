import type { Config } from "tailwindcss";
import { nextui } from "@nextui-org/theme";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}"
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
    },
  },
  darkMode: "class",
  plugins: [nextui({
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
