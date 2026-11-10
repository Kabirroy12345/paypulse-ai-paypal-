import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paypal: {
          navy: "#003087",
          blue: "#0070BA",
          sky: "#009CDE",
          gold: "#FFC439",
          dark: "#070B19",
          card: "#0D1326",
        },
      },
    },
  },
  plugins: [],
};
export default config;
