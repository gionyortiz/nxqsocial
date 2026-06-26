import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { MediaSafetyService } from '../../src/safety/media-safety.service';
import { StorageService } from '../../src/common/storage/storage.service';
import { REDIS_CLIENT } from '../../src/redis/redis.module';

export interface TestAppContext {
  app: INestApplication;
  module: TestingModule;
  notificationsMock: jest.Mocked<Pick<NotificationsService, 'sendEmailOtp' | 'sendPhoneOtp'>>;
  mediaSafetyMock: jest.Mocked<Pick<MediaSafetyService, 'scanImage' | 'scanImageFromS3' | 'startVideoScan' | 'startVideoScanJob' | 'pollVideoScan' | 'statusFromScan' | 'isEnabled'>>;
  storageMock: jest.Mocked<Pick<StorageService, 'upload' | 'delete' | 'isEnabled'>>;
}

export async function createTestApp(
  mediaSafetyEnabled = false,
  storageEnabled = false,
): Promise<TestAppContext> {
  const notificationsMock = {
    sendEmailOtp: jest.fn().mockResolvedValue(undefined),
    sendPhoneOtp: jest.fn().mockResolvedValue(undefined),
  };

  const mediaSafetyMock: any = {
    isEnabled: mediaSafetyEnabled,
    scanImage: jest.fn().mockResolvedValue({ safe: true, labels: [], maxConfidence: 0, provider: 'none' }),
    scanImageFromS3: jest.fn().mockResolvedValue({ safe: true, labels: [], maxConfidence: 0, provider: 'none' }),
    startVideoScan: jest.fn().mockResolvedValue(null),
    startVideoScanJob: jest.fn().mockResolvedValue({ status: 'BYPASSED', jobId: null }),
    pollVideoScan: jest.fn().mockResolvedValue({ status: 'IN_PROGRESS' }),
    getVideoScanResult: jest.fn().mockResolvedValue(null),
    statusFromScan: jest.fn().mockReturnValue('PUBLISHED'),
  };

  const storageMock: any = {
    isEnabled: storageEnabled,
    upload: jest.fn().mockResolvedValue('https://r2.example.com/test/image.jpg'),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(true),
    presignUpload: jest.fn().mockResolvedValue('https://r2.example.com/presign'),
    publicUrl: jest.fn().mockReturnValue('https://r2.example.com/test/key'),
  };

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(NotificationsService)
    .useValue(notificationsMock)
    .overrideProvider(MediaSafetyService)
    .useValue(mediaSafetyMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    // Mock Redis so E2E tests don't need a running Redis server and
    // don't leave open handles that block Jest from exiting.
    // Making incr throw causes the ActionRateLimitGuard to use its
    // in-memory fallback, which maintains real state and correctly
    // enforces rate limits in tests.
    .overrideProvider(REDIS_CLIENT)
    .useValue({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockRejectedValue(new Error('Redis unavailable (test)')),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockRejectedValue(new Error('Redis unavailable (test)')),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    })
    .compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api');
  await app.init();

  return { app, module: moduleFixture, notificationsMock: notificationsMock as any, mediaSafetyMock, storageMock };
}
