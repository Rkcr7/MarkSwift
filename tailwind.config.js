/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' rather than 'media' so the in-app toggle can override the OS
  // setting. The <html> element gets `.dark` added by the inline bootstrap
  // script in index.html before first paint.
  darkMode: 'class',
  content: [
    "./public/index.html",
    "./public/js/**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
