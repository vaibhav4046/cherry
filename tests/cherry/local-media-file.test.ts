import { describe, expect, it } from 'vitest';
import {
  MAX_LOCAL_MEDIA_FILE_BYTES,
  inspectLocalMediaBlob,
  readLocalMediaBytes,
} from '../../src/cherry/transcribe/local-whisper.ts';

describe('local media preflight', () => {
  it('rejects empty and oversized media before reading bytes', async () => {
    let reads = 0;
    const unread = {
      size: 0,
      arrayBuffer: async () => {
        reads += 1;
        return new ArrayBuffer(0);
      },
    };

    expect(inspectLocalMediaBlob(unread)).toEqual({
      ok: false,
      error: 'That media file is empty. Choose another file.',
    });
    await expect(readLocalMediaBytes(unread)).rejects.toThrow('That media file is empty');
    await expect(readLocalMediaBytes({ ...unread, size: MAX_LOCAL_MEDIA_FILE_BYTES + 1 })).rejects.toThrow('larger than 128 MiB');
    expect(reads).toBe(0);
  });

  it('returns a bounded non-empty media buffer', async () => {
    const expected = new Uint8Array([1, 2, 3]).buffer;
    await expect(readLocalMediaBytes({ size: 3, arrayBuffer: async () => expected })).resolves.toBe(expected);
  });
});
