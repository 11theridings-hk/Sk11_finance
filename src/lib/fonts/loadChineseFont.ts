import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const FONT_PATH_REGULAR = join(PROJECT_ROOT, 'public', 'fonts', 'NotoSansSC-Regular.ttf');
const FONT_PATH_BOLD = join(PROJECT_ROOT, 'public', 'fonts', 'msyh.ttf');

export type ChineseFontPack = {
  regular: Uint8Array;
  bold: Uint8Array;
  regularFamily: string;
  boldFamily: string;
};

let cache: ChineseFontPack | null = null;

export function loadChineseFonts(): ChineseFontPack {
  if (cache) return cache;
  let regularBuf: Uint8Array;
  let boldBuf: Uint8Array;
  let regularFamily = 'NotoSansSC';
  let boldFamily = 'NotoSansSC-Bold';
  try {
    regularBuf = new Uint8Array(readFileSync(FONT_PATH_REGULAR));
  } catch (_e) {
    throw new Error(
      `loadChineseFonts: 找不到 NotoSansSC-Regular.ttf (path=${FONT_PATH_REGULAR}). 請確認 public/fonts 存在。`,
    );
  }
  try {
    boldBuf = new Uint8Array(readFileSync(FONT_PATH_BOLD));
    boldFamily = 'MSYaHei';
  } catch (_e) {
    boldBuf = regularBuf;
    boldFamily = 'NotoSansSC';
  }
  cache = {
    regular: regularBuf,
    bold: boldBuf,
    regularFamily,
    boldFamily,
  };
  return cache;
}
