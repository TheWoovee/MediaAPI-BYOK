import Dexie from 'dexie';

export interface GalleryItem {
  id?: number;
  jobId: string;
  provider_id: string;
  model_id: string;
  capability: string;
  prompt?: string;
  blob: Blob;
  mime: string;
  filename: string;
  width?: number;
  height?: number;
  duration_s?: number;
  seed?: number;
  created_at: number;
}

class GalleryDB extends Dexie {
  gallery!: Dexie.Table<GalleryItem, number>;

  constructor() {
    super('studio-gallery');
    this.version(1).stores({
      gallery: '++id, jobId, provider_id, capability, created_at',
    });
  }
}

export const db = new GalleryDB();

export async function saveToGallery(item: Omit<GalleryItem, 'id'>): Promise<number> {
  return db.gallery.add(item as GalleryItem);
}

export async function getGalleryItems(limit = 100, offset = 0): Promise<GalleryItem[]> {
  return db.gallery.orderBy('created_at').reverse().offset(offset).limit(limit).toArray();
}

export async function clearGallery(): Promise<void> {
  await db.gallery.clear();
}

export async function getGalleryCount(): Promise<number> {
  return db.gallery.count();
}
