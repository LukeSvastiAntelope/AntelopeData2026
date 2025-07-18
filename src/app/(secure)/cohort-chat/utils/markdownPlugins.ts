import remarkGfm from 'remark-gfm';
import remarkSmart from 'remark-smartypants';

// Optional markdown plugins – if not installed, fall back gracefully
let smart: any = null;
try { 
  smart = remarkSmart; 
} catch {
  // Plugin not available, continue without it
}

const toPlugin = (mod: any) => {
  if (!mod) return null;
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  return null;
};

export const optionalRemark = [remarkGfm, toPlugin(smart)].filter(Boolean);
export const optionalRehype: any[] = []; 