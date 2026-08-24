-- Existing users remain active even when their historical emailVerified value
-- is false. Only registrations created by the hardened application path set
-- this discriminator to true.
ALTER TABLE "User"
ADD COLUMN "emailVerificationRequired" BOOLEAN NOT NULL DEFAULT false;
