// Imports ending in `?text` are the file's text (see esbuild.config.mjs).
declare module '*?text' {
  const text: string;
  export default text;
}

// engine/seal.js, a classic script, sets window.SEAL.
interface Seal {
  KEY: RegExp;
  ENVELOPE: RegExp;
  newKey(): string;
  seal(key: string, address: string, text: string): Promise<string>;
  open(key: string, address: string, envelope: string): Promise<string>;
}
interface Window {
  SEAL: Seal;
}
