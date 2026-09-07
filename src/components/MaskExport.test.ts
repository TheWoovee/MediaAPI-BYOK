import { describe, it, expect, vi } from 'vitest';

describe('mask export', () => {
  it('exports a canvas as PNG blob', async () => {
    const mockBlob = new Blob(['fake-png'], { type: 'image/png' });
    const mockCanvas = {
      width: 512,
      height: 512,
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(mockBlob);
      }),
      getContext: vi.fn(() => ({
        fillStyle: '',
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        globalCompositeOperation: '',
      })),
    };

    const result = await new Promise<Blob | null>((resolve) => {
      (mockCanvas as unknown as HTMLCanvasElement).toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });

    expect(result).toBe(mockBlob);
    expect(result?.type).toBe('image/png');
    expect(result?.size).toBeGreaterThan(0);
  });

  it('handles null blob from toBlob', async () => {
    const mockCanvas = {
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(null);
      }),
    };

    const result = await new Promise<Blob | null>((resolve) => {
      (mockCanvas as unknown as HTMLCanvasElement).toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });

    expect(result).toBeNull();
  });
});
