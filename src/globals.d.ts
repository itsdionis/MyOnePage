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

// engine/md.js as a module (see esbuild.config.mjs): the page's own Markdown converter, the part the plugin uses.
declare module '*md.js?api' {
  interface Issue {
    line: number;
    level: 'error' | 'warn' | 'info';
    msg: string;
  }
  interface Doc {
    meta: Record<string, string | undefined>;
    fm?: string;
    hero: { lines: string[]; highlight: string; tail: string; sub: string };
    blocks: { type: string }[];
  }
  const MD: {
    parse(src: string): { doc: Doc; issues: Issue[]; at: number[] };
    serialize(doc: Doc): string;
    check(doc: Doc, at?: number[]): Issue[];
  };
  export default MD;
}
