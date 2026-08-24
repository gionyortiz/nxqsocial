import { ServiceUnavailableException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController profile image storage', () => {
  const usersService = {
    updateAvatar: jest.fn(),
    updateBanner: jest.fn(),
  };
  const storage = {
    isEnabled: true,
    localDiskFallbackAllowed: false,
    upload: jest.fn(),
    deleteManagedObject: jest.fn().mockResolvedValue(true),
  };

  let controller: UsersController;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.isEnabled = true;
    storage.localDiskFallbackAllowed = false;
    controller = new UsersController(usersService as any, storage as any);
  });

  it('stores multipart avatars in persistent object storage', async () => {
    storage.upload.mockResolvedValue(
      'https://media.example.invalid/avatars/avatar.jpg',
    );
    usersService.updateAvatar.mockResolvedValue({
      id: 'user-1',
      avatarUrl: 'https://media.example.invalid/avatars/avatar.jpg',
    });
    const file = {
      buffer: Buffer.from('avatar'),
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await controller.uploadAvatar({ id: 'user-1' }, file);

    expect(storage.upload).toHaveBeenCalledWith(
      file.buffer,
      'avatar.jpg',
      'image/jpeg',
      'avatars',
    );
    expect(usersService.updateAvatar).toHaveBeenCalledWith(
      'user-1',
      'https://media.example.invalid/avatars/avatar.jpg',
    );
  });

  it('stores multipart banners in a separate persistent prefix', async () => {
    storage.upload.mockResolvedValue(
      'https://media.example.invalid/banners/banner.webp',
    );
    usersService.updateBanner.mockResolvedValue({
      id: 'user-1',
      bannerUrl: 'https://media.example.invalid/banners/banner.webp',
    });
    const file = {
      buffer: Buffer.from('banner'),
      originalname: 'banner.webp',
      mimetype: 'image/webp',
    } as Express.Multer.File;

    await controller.uploadBanner({ id: 'user-1' }, file);

    expect(storage.upload).toHaveBeenCalledWith(
      file.buffer,
      'banner.webp',
      'image/webp',
      'banners',
    );
    expect(usersService.updateBanner).toHaveBeenCalledWith(
      'user-1',
      'https://media.example.invalid/banners/banner.webp',
    );
  });

  it('stores raw mobile avatar uploads in persistent object storage', async () => {
    storage.upload.mockResolvedValue(
      'https://media.example.invalid/avatars/mobile.jpg',
    );
    usersService.updateAvatar.mockResolvedValue({
      id: 'user-1',
      avatarUrl: 'https://media.example.invalid/avatars/mobile.jpg',
    });
    const request = {
      headers: {
        'content-type': 'image/jpeg',
        'content-length': '6',
      },
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield Buffer.from('avatar');
      },
    };

    await controller.uploadAvatarRaw({ id: 'user-1' }, request as any);

    expect(storage.upload).toHaveBeenCalledWith(
      Buffer.from('avatar'),
      'avatar.jpg',
      'image/jpeg',
      'avatars',
    );
    expect(usersService.updateAvatar).toHaveBeenCalledWith(
      'user-1',
      'https://media.example.invalid/avatars/mobile.jpg',
    );
  });

  it('does not fall back to ephemeral disk when production storage fails', async () => {
    storage.upload.mockRejectedValue(new Error('R2 unavailable'));
    const file = {
      buffer: Buffer.from('avatar'),
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await expect(
      controller.uploadAvatar({ id: 'user-1' }, file),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(usersService.updateAvatar).not.toHaveBeenCalled();
  });

  it('removes a newly uploaded avatar when the database update fails', async () => {
    const avatarUrl = 'https://media.example.invalid/avatars/orphan.jpg';
    storage.upload.mockResolvedValue(avatarUrl);
    usersService.updateAvatar.mockRejectedValue(
      new Error('database unavailable'),
    );
    const file = {
      buffer: Buffer.from('avatar'),
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await expect(
      controller.uploadAvatar({ id: 'user-1' }, file),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(avatarUrl, [
      'avatars',
    ]);
  });

  it('removes a newly uploaded banner when the database update fails', async () => {
    const bannerUrl = 'https://media.example.invalid/banners/orphan.webp';
    storage.upload.mockResolvedValue(bannerUrl);
    usersService.updateBanner.mockRejectedValue(
      new Error('database unavailable'),
    );
    const file = {
      buffer: Buffer.from('banner'),
      originalname: 'banner.webp',
      mimetype: 'image/webp',
    } as Express.Multer.File;

    await expect(
      controller.uploadBanner({ id: 'user-1' }, file),
    ).rejects.toThrow('database unavailable');

    expect(storage.deleteManagedObject).toHaveBeenCalledWith(bannerUrl, [
      'banners',
    ]);
  });
});
