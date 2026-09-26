// vite.config.ts (main build) `define` ile enjekte edilir: package.json `repository` ham
// değeri. Test ortamında tanımsız — tüketici `typeof` guard'ı ile okur (bkz. updater.ts).
declare const __APP_REPOSITORY__: string;
