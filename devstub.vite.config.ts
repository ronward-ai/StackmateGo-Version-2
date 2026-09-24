import baseConfig from './vite.config';
import path from 'path';
import { mergeConfig, type UserConfig } from 'vite';
export default async (env: any) => {
  const base = (typeof baseConfig === 'function' ? await (baseConfig as any)(env) : baseConfig) as UserConfig;
  return mergeConfig(base, {
    resolve: {
      alias: [
        { find: /(^@\/|\.\.\/)lib\/firebase$/, replacement: path.resolve(__dirname, '.devstub/firebase.ts') },
        { find: /^@\/hooks\/useAuth$/, replacement: path.resolve(__dirname, '.devstub/useAuth.ts') },
      ],
    },
  });
};
