import { MediaSafetyService } from './media-safety.service';

const ORIGINAL_ENV = process.env;

describe('MediaSafetyService staging moderation provider', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.REKOGNITION_REGION;
    delete process.env.REKOGNITION_ACCESS_KEY_ID;
    delete process.env.REKOGNITION_SECRET_ACCESS_KEY;
    delete process.env.REKOGNITION_S3_BUCKET;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('uses the synthetic-safe mock only on the staging release target', async () => {
    process.env.MEDIA_MODERATION_PROVIDER = 'staging-mock';
    process.env.NXQ_RELEASE_TARGET = 'staging';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';

    const service = new MediaSafetyService();

    expect(service.isEnabled).toBe(true);
    await expect(
      service.scanImage(Buffer.from('synthetic fixture')),
    ).resolves.toEqual({
      safe: true,
      labels: [],
      maxConfidence: 0,
      provider: 'staging-mock',
    });
    await expect(
      service.startVideoScanFile('', 'nxq-social/synthetic.mp4'),
    ).resolves.toEqual({ status: 'BYPASSED', jobId: null });
  });

  it('refuses to enable the staging mock for a production target', () => {
    process.env.MEDIA_MODERATION_PROVIDER = 'staging-mock';
    process.env.NXQ_RELEASE_TARGET = 'production';
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production';

    expect(() => new MediaSafetyService()).toThrow(
      /allowed only in the staging release target/,
    );
  });
});
