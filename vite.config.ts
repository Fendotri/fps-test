import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import path from 'path';

export default defineConfig(({ mode }) => {
    const isLite = mode === 'lite' || `${process.env.VITE_BUILD_PROFILE || ''}`.trim().toLowerCase() === 'lite';

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
