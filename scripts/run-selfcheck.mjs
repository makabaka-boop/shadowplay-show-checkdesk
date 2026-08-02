// 入口：注册 TS/目录解析 hook 后运行自检脚本，避免 --experimental-loader 警告
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-resolve-hook.mjs', pathToFileURL(import.meta.dirname + '/'));

await import('./inspection-selfcheck.mjs');
