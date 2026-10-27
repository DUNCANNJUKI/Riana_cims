import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
		"./CRMS/src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
			extend: {
			fontFamily: {
				sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				pending: {
					DEFAULT: 'hsl(var(--pending))',
					foreground: 'hsl(var(--pending-foreground))'
				},
				status: {
					pending: 'hsl(var(--status-pending))',
					'pending-bg': 'hsl(var(--status-pending-bg))',
					approved: 'hsl(var(--status-approved))',
					'approved-bg': 'hsl(var(--status-approved-bg))',
					rejected: 'hsl(var(--status-rejected))',
					'rejected-bg': 'hsl(var(--status-rejected-bg))',
					waiting: 'hsl(var(--status-waiting))',
					'waiting-bg': 'hsl(var(--status-waiting-bg))',
					'in-progress': 'hsl(var(--status-in-progress))',
					'in-progress-bg': 'hsl(var(--status-in-progress-bg))',
					completed: 'hsl(var(--status-completed))',
					'completed-bg': 'hsl(var(--status-completed-bg))',
				},
				priority: {
					low: 'hsl(var(--priority-low))',
					medium: 'hsl(var(--priority-medium))',
					high: 'hsl(var(--priority-high))',
					critical: 'hsl(var(--priority-critical))',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
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
				},
				'robot-blink': {
					'0%, 90%, 100%': { opacity: '1' },
					'95%': { opacity: '0.3' }
				},
				'robot-glow': {
					'0%, 100%': { boxShadow: '0 0 20px hsl(var(--primary) / 0.5)' },
					'50%': { boxShadow: '0 0 30px hsl(var(--primary) / 0.8)' }
				},
				'robot-head-tilt': {
					'0%, 100%': { transform: 'rotate(0deg)' },
					'25%': { transform: 'rotate(-2deg)' },
					'75%': { transform: 'rotate(2deg)' }
				},
				'pulse-glow': {
					'0%, 100%': { opacity: '1', transform: 'scale(1)' },
					'50%': { opacity: '0.8', transform: 'scale(1.02)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'robot-blink': 'robot-blink 3s infinite',
				'robot-glow': 'robot-glow 2s ease-in-out infinite',
				'robot-head-tilt': 'robot-head-tilt 4s ease-in-out infinite',
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite'
			},
			boxShadow: {
				soft: '0 1px 3px rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
				medium: '0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
			},
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
