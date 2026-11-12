export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["Inter Variable", "sans-serif"] },
      fontSize: {
        xs: ["var(--fs-caption)", { lineHeight: "1.25" }],
        sm: ["var(--fs-body)", { lineHeight: "1.45" }],
        base: ["var(--fs-lead)", { lineHeight: "1.5" }],
        lg: ["var(--fs-lead)", { lineHeight: "1.4", fontWeight: "600" }],
        xl: ["var(--fs-title)", { lineHeight: "1.3" }],
        "2xl": ["var(--fs-heading)", { lineHeight: "1.25" }],
        display: ["var(--fs-display)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--border))",
        ring: "hsl(var(--focus))",
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--primary-foreground))" },
        platform: { zomato: "var(--platform-zomato)", swiggy: "var(--platform-swiggy)" },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--primary-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--primary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "var(--surface-2)",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--surface))",
          foreground: "hsl(var(--foreground))",
        },
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
          6: "var(--chart-6)",
          7: "var(--chart-7)",
          8: "var(--chart-8)",
        },
      },
      boxShadow: {
        DEFAULT: "var(--shadow-2)",
        "2xs": "var(--shadow-1)",
        xs: "var(--shadow-1)",
        sm: "var(--shadow-2)",
        md: "var(--shadow-3)",
        lg: "var(--shadow-3)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        card: "var(--radius)",
        "card-sm": "var(--radius-sm)",
        "card-md": "var(--radius-md)",
        "card-lg": "var(--radius-lg)",
        full: "var(--radius-full)",
      },
      transitionDuration: {
        micro: "var(--motion-micro)",
        standard: "var(--motion-standard)",
        chart: "var(--motion-chart)",
      },
      transitionTimingFunction: {
        custom: "var(--ease)",
      },
    },
  },
  plugins: [],
};
