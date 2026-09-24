// Next resolves CSS `@import` itself (including url() rebasing for
// @fontsource), so postcss-import is not needed.
module.exports = {
  plugins: {
    'tailwindcss/nesting': {},
    tailwindcss: {},
    autoprefixer: {},
    'postcss-preset-env': {
      features: {'nesting-rules': false},
    },
  },
};
