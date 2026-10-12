// Версия ассетов по содержимому файла: любая правка CSS/JS меняет URL (?v=…),
// поэтому браузер не показывает читателю устаревший кэш (иначе старый CSS/JS «переживает» деплой
// и, например, увеличение схемы остаётся чёрным на старом коде).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cache = new Map<string, string>();

export function assetV(publicPath: string): string {
  if (cache.has(publicPath)) return cache.get(publicPath)!;
  let hash = 'dev';
  try {
    hash = createHash('sha1').update(readFileSync(resolve(process.cwd(), 'public', publicPath.replace(/^\//, '')))).digest('hex').slice(0, 8);
  } catch (e) {
    // файла нет — оставляем нейтральный маркер, сборка не падает
  }
  cache.set(publicPath, hash);
  return hash;
}
