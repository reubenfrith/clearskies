/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Geotab blue palette — matches MyGeotab chrome
        geotab: {
          blue: "#0073CF",
          "blue-dark": "#005BA1",
        },
      },
    },
  },
  plugins: [],
};
