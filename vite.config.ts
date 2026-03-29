import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import path from 'path';

export default defineConfig(({ mode }) => {
    const isLite = mode === 'lite' || `${process.env.VITE_BUILD_PROFILE || ''}`.trim().toLowerCase() === 'lite';
    const devHost = `${process.env.VITE_DEV_HOST || ''}`.trim() || '0.0.0.0';
    const devPort = Number(process.env.VITE_DEV_PORT || 5173) || 5173;
    const hmrHost = `${process.env.VITE_DEV_HMR_HOST || ''}`.trim();
    const backendHost = `${process.env.BACKEND_HOST || '127.0.0.1'}`.trim() || '127.0.0.1';
    const backendPort = Number(process.env.BACKEND_PORT || 8787) || 8787;
    const backendTarget = `http://${backendHost === '0.0.0.0' ? '127.0.0.1' : backendHost}:${backendPort}`;

    return {
        base: '/',
        root: path.resolve(__dirname, './multi_pages/'),
        publicDir: path.resolve(__dirname, './public/'),
        assetsInclude: ['*.vert', '*.frag', '*.glsl'],
        build: {
            outDir: path.resolve(__dirname, './cube_gunman'),
            target: isLite ? 'es2018' : 'esnext',
            sourcemap: isLite ? false : true,
            emptyOutDir: true,
            minify: isLite ? 'esbuild' : false,
            assetsInlineLimit: isLite ? 4096 : 40960,
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, './multi_pages/index.html'),
                },
                output: {
                    manualChunks(id) {
                        if (id.includes('node_modules/three')) return 'vendor-three';
                        if (id.includes('/viewlayers/DomLayer') || id.includes('/services/BackendApi')) return 'menu-online';
                        return undefined;
                    },
                },
            },
        },
        resolve: {
            mainFields: ['module', 'jsnext:main', 'jsnext'],
            extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
            alias: {
                '@src': path.resolve(__dirname, './src/'),
                '@assets': path.resolve(__dirname, './assets/'),
                '@gameplay': path.resolve(__dirname, './src/gameplay/'),
                '@game-object-map': path.resolve(__dirname, './src/core/GameObjectMap.ts'),
            },
        },
        plugins: [vue(), vueJsx()],
        server: {
            host: devHost,
            port: devPort,
            strictPort: true,
            hmr: hmrHost ? { host: hmrHost, port: devPort } : undefined,
            proxy: {
                '/api': {
                    target: backendTarget,
                    changeOrigin: true,
                },
                '/ws': {
                    target: backendTarget.replace(/^http/i, 'ws'),
                    ws: true,
                    changeOrigin: true,
                },
            },
        },
        envDir: path.resolve(__dirname, './envs/'),
        envPrefix: 'VITE_',
        css: {
            modules: {
                generateScopedName: '[local]_[hash:base64:5]',
                hashPrefix: 'prefix',
                localsConvention: 'dashes',
            },
            preprocessorOptions: {
                scss: {
                    charset: false,
                },
            },
        },
    };
});
