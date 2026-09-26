declare module 'heic-convert' {
  interface ConvertOptions {
    /** Node Buffer veya ArrayBuffer */
    buffer: Buffer | ArrayBuffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  /** Tek resim dönüştür → ArrayBuffer döner */
  function heicConvert(options: ConvertOptions): Promise<ArrayBuffer>;

  export = heicConvert;
}
