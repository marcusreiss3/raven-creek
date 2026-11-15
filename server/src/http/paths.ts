import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Pasta pública do cliente (onde ficam /assets). Em produção o servidor também serve o build. */
export const CLIENT_PUBLIC_DIR = process.env.CLIENT_PUBLIC_DIR ?? path.resolve(here, '../../../client/public');
export const CLIENT_DIST_DIR = path.resolve(here, '../../../client/dist');
