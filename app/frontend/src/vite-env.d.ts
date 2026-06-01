/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module 'monaco-editor' {
  export namespace editor {
    interface IStandaloneCodeEditor {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const languages: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const KeyMod: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const KeyCode: any
}
