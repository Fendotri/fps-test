/// <reference types="vite/client" />

declare module '*.glsl' {
    export default string
}

declare module '*.vert' {
    export default string
}

declare module '*.frag' {
    export default string
}

interface ImportMetaEnv {
    readonly VITE_PUBLIC_ROOT: string
    readonly VITE_BUILD_PROFILE?: string
    readonly VITE_ENABLE_SPRAY_LAB?: string
    readonly VITE_QUALITY_AUTO?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
