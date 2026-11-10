// Minimal local type shims for the two untyped call libraries StreamRoom
// uses (Phase 3c). Neither `simple-peer` nor `recordrtc` ships bundled
// types, and the community @types packages for them are stale; these
// shims cover ONLY the members StreamRoom actually calls. No `any`
// anywhere here — signal payloads are `unknown` and narrowed by the
// caller. If either library is ever replaced, delete this file with it.
declare module "simple-peer" {
  export interface SimplePeerOptions {
    initiator: boolean;
    trickle: boolean;
    stream?: MediaStream | null;
  }

  export default class SimplePeer {
    constructor(options: SimplePeerOptions);
    on(event: "signal", callback: (data: unknown) => void): void;
    on(event: "stream", callback: (stream: MediaStream) => void): void;
    on(event: "close" | "error", callback: (error: Error) => void): void;
    signal(data: unknown): void;
    replaceTrack(
      oldTrack: MediaStreamTrack,
      newTrack: MediaStreamTrack,
      stream: MediaStream,
    ): void;
    destroy(): void;
  }
}

declare module "recordrtc" {
  export interface RecordRTCOptions {
    mimeType: string;
  }

  export default class RecordRTC {
    constructor(stream: MediaStream, options: RecordRTCOptions);
    startRecording(): void;
    stopRecording(callback: () => void): void;
    getBlob(): Blob;
  }
}
