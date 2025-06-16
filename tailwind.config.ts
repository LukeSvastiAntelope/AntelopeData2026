import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    fontSize: {
      'xs': '0.75rem',     // 12px
      'sm': '0.8125rem',   // 13px
      'base': '0.875rem',  // 14px
      'lg': '0.9375rem',   // 15px
      'xl': '1rem',        // 16px
      '2xl': '1.125rem',   // 18px
      '3xl': '1.25rem',    // 20px
      '4xl': '1.5rem',     // 24px
      '5xl': '1.875rem',   // 30px
      '6xl': '2.25rem',    // 36px
      '7xl': '3rem',       // 48px
      '8xl': '3.75rem',    // 60px
      '9xl': '4.5rem',     // 72px
      'base-sm': '0.8125rem',
      'base-md': '0.875rem',
      'base-lg': '0.9375rem'
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)"
      },
      fontFamily: {
        sans: ['var(--font-noto-sans)'],
        kodemono: ['Kode Mono', 'serif']
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      typography: {
        DEFAULT: {
          css: {
            // Better base typography
            fontSize: '0.9375rem', // 15px base
            lineHeight: '1.6',
            color: 'hsl(var(--foreground))',
            maxWidth: 'none',
            
            // Improved paragraph spacing
            p: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
              lineHeight: '1.65',
            },
            
            // Better heading hierarchy
            'h1, h2, h3, h4': {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              lineHeight: '1.3',
            },
            
            h1: {
              fontSize: '1.5em',
              marginTop: '0',
              marginBottom: '0.8888889em',
            },
            
            h2: {
              fontSize: '1.25em',
              marginTop: '1.6em',
              marginBottom: '0.8em',
            },
            
            h3: {
              fontSize: '1.125em',
              marginTop: '1.5555556em',
              marginBottom: '0.6666667em',
            },
            
            // Enhanced links
            a: {
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
              fontWeight: '500',
              '&:hover': {
                color: 'hsl(var(--primary))',
                textDecoration: 'underline',
              },
            },
            
            // Better lists
            'ul, ol': {
              marginTop: '1.25em',
              marginBottom: '1.25em',
              paddingLeft: '1.625em',
            },
            
            li: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
            
            'li p': {
              marginTop: '0.75em',
              marginBottom: '0.75em',
            },
            
            // Code styling
            code: {
              color: 'hsl(var(--foreground))',
              backgroundColor: 'hsl(var(--muted))',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              paddingTop: '0.125rem',
              paddingBottom: '0.125rem',
              borderRadius: '0.25rem',
              fontSize: '0.875em',
              fontWeight: '500',
            },
            
            'code::before': {
              content: '""',
            },
            
            'code::after': {
              content: '""',
            },
            
            // Blockquotes
            blockquote: {
              fontWeight: '400',
              fontStyle: 'italic',
              color: 'hsl(var(--muted-foreground))',
              borderLeftWidth: '0.25rem',
              borderLeftColor: 'hsl(var(--border))',
              quotes: '"\\201C""\\201D""\\2018""\\2019"',
              marginTop: '1.6em',
              marginBottom: '1.6em',
              paddingLeft: '1em',
            },
            
            // Tables
            table: {
              width: '100%',
              tableLayout: 'auto',
              textAlign: 'left',
              marginTop: '2em',
              marginBottom: '2em',
              fontSize: '0.875em',
              lineHeight: '1.7142857',
            },
            
            thead: {
              borderBottomWidth: '1px',
              borderBottomColor: 'hsl(var(--border))',
            },
            
            'thead th': {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              verticalAlign: 'bottom',
              paddingRight: '0.5714286em',
              paddingBottom: '0.5714286em',
              paddingLeft: '0.5714286em',
            },
            
            'tbody tr': {
              borderBottomWidth: '1px',
              borderBottomColor: 'hsl(var(--border))',
            },
            
            'tbody td': {
              verticalAlign: 'baseline',
              paddingTop: '0.5714286em',
              paddingRight: '0.5714286em',
              paddingBottom: '0.5714286em',
              paddingLeft: '0.5714286em',
            },
          },
        },
        
        // Responsive sizes
        sm: {
          css: {
            fontSize: '0.875rem',
            lineHeight: '1.6',
            p: {
              marginTop: '1.1428571em',
              marginBottom: '1.1428571em',
            },
          },
        },
        
        lg: {
          css: {
            fontSize: '1rem',
            lineHeight: '1.65',
            p: {
              marginTop: '1.3333333em',
              marginBottom: '1.3333333em',
            },
          },
        },
        
        xl: {
          css: {
            fontSize: '1.125rem',
            lineHeight: '1.7',
            p: {
              marginTop: '1.4444444em',
              marginBottom: '1.4444444em',
            },
          },
        },
      },
    },
  },
  darkMode: ["class"],
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
};

export default config;
