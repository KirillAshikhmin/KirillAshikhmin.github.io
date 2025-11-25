// Polyfill for Node.js process module in browser
export default {
  env: typeof process !== 'undefined' && process.env ? process.env : {},
  versions: typeof process !== 'undefined' && process.versions ? process.versions : {},
  platform: typeof process !== 'undefined' && process.platform ? process.platform : 'browser',
  nextTick: typeof process !== 'undefined' && process.nextTick ? process.nextTick : (fn) => setTimeout(fn, 0),
  cwd: () => '/',
  exit: () => {},
  on: () => {},
  off: () => {},
  emit: () => {}
};
