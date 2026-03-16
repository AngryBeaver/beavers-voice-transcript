declare module 'prism-media' {
  import { Transform } from 'stream';
  export namespace opus {
    class Decoder extends Transform {
      constructor(options: { rate: number; channels: number; frameSize: number });
    }
  }
}
