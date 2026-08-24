import { promises as fs } from 'fs';
import {
  cleanupOwnedMediaReferences,
  ownedLocalUploadPath,
} from './owned-media-cleanup';

describe('owned media cleanup', () => {
  const storage = {
    bucketName: 'nxq-media',
    managedKeyFromReference: jest.fn(),
    deleteManagedObject: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    storage.managedKeyFromReference.mockImplementation(
      (reference: string | null | undefined, prefixes: readonly string[]) => {
        if (!reference) return null;
        const key = reference.startsWith('https://media.example.invalid/')
          ? new URL(reference).pathname.slice(1)
          : reference;
        return prefixes.some((prefix) => key.startsWith(`${prefix}/`))
          ? key
          : null;
      },
    );
    storage.deleteManagedObject.mockResolvedValue(true);
  });

  it('contains local cleanup paths under uploads and an allowed prefix', () => {
    expect(
      ownedLocalUploadPath('/api/uploads/avatars/user.jpg', ['avatars']),
    ).toContain('uploads');
    expect(
      ownedLocalUploadPath('/uploads/../private.txt', ['avatars']),
    ).toBeNull();
    expect(
      ownedLocalUploadPath('/uploads/banners/user.jpg', ['avatars']),
    ).toBeNull();
    expect(
      ownedLocalUploadPath(
        'https://foreign.example.invalid/api/uploads/avatars/user.jpg',
        ['avatars'],
      ),
    ).toBeNull();
  });

  it('deduplicates owned object references and skips foreign references', async () => {
    storage.managedKeyFromReference.mockImplementation(
      (reference: string | null | undefined) =>
        reference === 'images/photo.jpg' ? 'images/photo.jpg' : null,
    );

    const result = await cleanupOwnedMediaReferences(storage as any, [
      { value: 'images/photo.jpg', prefixes: ['images'] },
      { value: 'images/photo.jpg', prefixes: ['images'] },
      {
        value: 'https://foreign.example.invalid/images/photo.jpg',
        prefixes: ['images'],
      },
    ]);

    expect(storage.deleteManagedObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteManagedObject).toHaveBeenCalledWith(
      'images/photo.jpg',
      ['images'],
    );
    expect(result).toEqual({ deleted: 1, skipped: 1, failed: 0 });
  });

  it('removes an owned local reference without issuing an object-store delete', async () => {
    const unlink = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    await cleanupOwnedMediaReferences(storage as any, [
      { value: '/uploads/images/photo.jpg', prefixes: ['images'] },
    ]);

    expect(unlink).toHaveBeenCalledTimes(1);
    expect(storage.deleteManagedObject).not.toHaveBeenCalled();
    unlink.mockRestore();
  });
});
