import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import tailwindcssTypography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
  	fontSize: {
  		xs: '0.75rem',
  		sm: '0.8125rem',
  		base: '0.875rem',
  		lg: '0.9375rem',
  		xl: '1rem',
  		'2xl': '1.125rem',
  		'3xl': '1.25rem',
  		'4xl': '1.5rem',
  		'5xl': '1.875rem',
  		'6xl': '2.25rem',
  		'7xl': '3rem',
  		'8xl': '3.75rem',
  		'9xl': '4.5rem',
  		'base-sm': '0.8125rem',
  		'base-md': '0.875rem',
  		'base-lg': '0.9375rem'
  	},
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			},
  			sidebar: {
  				DEFAULT: 'var(--sidebar)',
  				foreground: 'var(--sidebar-foreground)',
  				primary: 'var(--sidebar-primary)',
  				'primary-foreground': 'var(--sidebar-primary-foreground)',
  				accent: 'var(--sidebar-accent)',
  				'accent-foreground': 'var(--sidebar-accent-foreground)',
  				border: 'var(--sidebar-border)',
  				ring: 'var(--sidebar-ring)'
  			},
  			neutral: {
  				'300': 'var(--neutral-300)',
  				'400': 'var(--neutral-400)',
  				'500': 'var(--neutral-500)',
  				'600': 'var(--neutral-600)',
  				'700': 'var(--neutral-700)',
  				'800': 'var(--neutral-800)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			xl: 'calc(var(--radius) + 4px)'
  		},
  		fontFamily: {
  			sans: [
  				'var(--font-inter)'
  			],
  			kodemono: [
  				'Kode Mono',
  				'serif'
  			]
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		typography: {
  			DEFAULT: {
  				css: {
  					fontSize: '0.9375rem',
  					lineHeight: '1.6',
  					color: 'var(--foreground)',
  					maxWidth: 'none',
  					p: {
  						marginTop: '1.25em',
  						marginBottom: '1.25em',
  						lineHeight: '1.65'
  					},
  					'h1, h2, h3, h4': {
  						color: 'var(--foreground)',
  						fontWeight: '600',
  						lineHeight: '1.3'
  					},
  					h1: {
  						fontSize: '1.5em',
  						marginTop: '0',
  						marginBottom: '0.8888889em'
  					},
  					h2: {
  						fontSize: '1.25em',
  						marginTop: '1.6em',
  						marginBottom: '0.8em'
  					},
  					h3: {
  						fontSize: '1.125em',
  						marginTop: '1.5555556em',
  						marginBottom: '0.6666667em'
  					},
  					a: {
  						color: 'var(--primary)',
  						textDecoration: 'none',
  						fontWeight: '500',
  						'&:hover': {
  							color: 'var(--primary)',
  							textDecoration: 'underline'
  						}
  					},
  					'ul, ol': {
  						marginTop: '1.25em',
  						marginBottom: '1.25em',
  						paddingLeft: '1.625em'
  					},
  					li: {
  						marginTop: '0.5em',
  						marginBottom: '0.5em'
  					},
  					'li p': {
  						marginTop: '0.75em',
  						marginBottom: '0.75em'
  					},
  					code: {
  						color: 'var(--foreground)',
  						backgroundColor: 'var(--muted)',
  						paddingLeft: '0.25rem',
  						paddingRight: '0.25rem',
  						paddingTop: '0.125rem',
  						paddingBottom: '0.125rem',
  						borderRadius: '0.25rem',
  						fontSize: '0.875em',
  						fontWeight: '500'
  					},
  					'code::before': {
  						content: '"'
  					},
  					'code::after': {
  						content: '"'
  					},
  					blockquote: {
  						fontWeight: '400',
  						fontStyle: 'italic',
  						color: 'var(--muted-foreground)',
  						borderLeftWidth: '0.25rem',
  						borderLeftColor: 'var(--border)',
  						quotes: '\\\\201C""\\\\201D""\\\\2018""\\\\2019"',
  						marginTop: '1.6em',
  						marginBottom: '1.6em',
  						paddingLeft: '1em'
  					},
  					table: {
  						width: '100%',
  						tableLayout: 'auto',
  						textAlign: 'left',
  						marginTop: '2em',
  						marginBottom: '2em',
  						fontSize: '0.875em',
  						lineHeight: '1.7142857'
  					},
  					thead: {
  						borderBottomWidth: '1px',
  						borderBottomColor: 'var(--border)'
  					},
  					'thead th': {
  						color: 'var(--foreground)',
  						fontWeight: '600',
  						verticalAlign: 'bottom',
  						paddingRight: '0.5714286em',
  						paddingBottom: '0.5714286em',
  						paddingLeft: '0.5714286em'
  					},
  					'tbody tr': {
  						borderBottomWidth: '1px',
  						borderBottomColor: 'var(--border)'
  					},
  					'tbody td': {
  						verticalAlign: 'baseline',
  						paddingTop: '0.5714286em',
  						paddingRight: '0.5714286em',
  						paddingBottom: '0.5714286em',
  						paddingLeft: '0.5714286em'
  					}
  				}
  			},
  			sm: {
  				css: {
  					fontSize: '0.875rem',
  					lineHeight: '1.6',
  					p: {
  						marginTop: '1.1428571em',
  						marginBottom: '1.1428571em'
  					}
  				}
  			},
  			lg: {
  				css: {
  					fontSize: '1rem',
  					lineHeight: '1.65',
  					p: {
  						marginTop: '1.3333333em',
  						marginBottom: '1.3333333em'
  					}
  				}
  			},
  			xl: {
  				css: {
  					fontSize: '1.125rem',
  					lineHeight: '1.7',
  					p: {
  						marginTop: '1.4444444em',
  						marginBottom: '1.4444444em'
  					}
  				}
  			}
  		}
  	}
  },
  darkMode: ["class"],
  plugins: [tailwindcssAnimate, tailwindcssTypography],
};

export default config;
