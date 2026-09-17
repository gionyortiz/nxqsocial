import {
  filterStagingPushTokens,
  isStagingEmailRecipientAllowed,
  isStagingPhoneRecipientAllowed,
  isStagingOutboundRestricted,
  validateStagingOutboundDeliveryConfiguration,
} from './staging-outbound-policy';

const stagingEnvironment = {
  NXQ_RELEASE_TARGET: 'staging',
  STAGING_EMAIL_RECIPIENT_ALLOWLIST: 'operator@nxqsocial.test',
  STAGING_PHONE_RECIPIENT_ALLOWLIST: 'disabled',
  STAGING_PUSH_TOKEN_ALLOWLIST: 'disabled',
};

describe('staging outbound delivery policy', () => {
  it('treats either staging marker as a restrictive delivery boundary', () => {
    expect(isStagingOutboundRestricted(stagingEnvironment)).toBe(true);
    expect(
      isStagingOutboundRestricted({ RAILWAY_ENVIRONMENT_NAME: 'staging' }),
    ).toBe(true);
    expect(
      isStagingOutboundRestricted({ NXQ_RELEASE_TARGET: 'production' }),
    ).toBe(false);
  });

  it('allows only exact configured email recipients in staging', () => {
    expect(
      isStagingEmailRecipientAllowed(
        'operator@nxqsocial.test',
        stagingEnvironment,
      ),
    ).toBe(true);
    expect(
      isStagingEmailRecipientAllowed(
        'restored-customer@example.test',
        stagingEnvironment,
      ),
    ).toBe(false);
    expect(
      isStagingEmailRecipientAllowed('restored-customer@example.test', {
        NXQ_RELEASE_TARGET: 'production',
      }),
    ).toBe(true);
  });

  it('denies all push tokens when staging delivery is explicitly disabled', () => {
    expect(
      filterStagingPushTokens(
        ['ExponentPushToken[test-device]', 'ExponentPushToken[restored-user]'],
        stagingEnvironment,
      ),
    ).toEqual([]);
  });

  it('denies all SMS recipients when staging SMS delivery is disabled', () => {
    expect(
      isStagingPhoneRecipientAllowed('+15551234567', stagingEnvironment),
    ).toBe(false);
    expect(
      isStagingPhoneRecipientAllowed('+15551234567', {
        ...stagingEnvironment,
        STAGING_PHONE_RECIPIENT_ALLOWLIST: '+15551234567',
      }),
    ).toBe(true);
    expect(
      isStagingPhoneRecipientAllowed('+15551234567', {
        NXQ_RELEASE_TARGET: 'production',
      }),
    ).toBe(true);
  });

  it('filters staging push delivery to explicit test-device tokens only', () => {
    const allowed = 'ExponentPushToken[test-device]';
    expect(
      filterStagingPushTokens([allowed, 'ExponentPushToken[restored-user]'], {
        ...stagingEnvironment,
        STAGING_PUSH_TOKEN_ALLOWLIST: allowed,
      }),
    ).toEqual([allowed]);
  });

  it('fails closed when staging configuration is missing or malformed', () => {
    expect(
      validateStagingOutboundDeliveryConfiguration({
        NXQ_RELEASE_TARGET: 'staging',
      }),
    ).toEqual([
      'STAGING_EMAIL_RECIPIENT_ALLOWLIST must contain unique, valid test-recipient email addresses',
      'STAGING_PHONE_RECIPIENT_ALLOWLIST must be disabled or contain unique E.164 test phone numbers',
      'STAGING_PUSH_TOKEN_ALLOWLIST must be disabled or contain unique Expo push tokens',
    ]);

    expect(
      validateStagingOutboundDeliveryConfiguration({
        ...stagingEnvironment,
        STAGING_EMAIL_RECIPIENT_ALLOWLIST:
          'operator@nxqsocial.test,operator@nxqsocial.test',
        STAGING_PHONE_RECIPIENT_ALLOWLIST: 'not-a-phone',
        STAGING_PUSH_TOKEN_ALLOWLIST: 'not-a-push-token',
      }),
    ).toHaveLength(3);
  });

  it('accepts an explicit test recipient and disabled push delivery', () => {
    expect(
      validateStagingOutboundDeliveryConfiguration(stagingEnvironment),
    ).toEqual([]);
  });
});
