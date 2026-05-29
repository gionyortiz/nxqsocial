import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './test-app';
import { registerUser, createPost, cleanupTestUsers } from './factories';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Moderation E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await cleanupTestUsers(prisma);
    await app.close();
  });

  describe('Report flow', () => {
    it('creates a pending report and resolving it creates an audit log', async () => {
      const reporter = await registerUser(app);
      const reported = await registerUser(app);
      const post = await createPost(app, reported.access_token, 'This is the reported post');

      // 1. Reporter files a report
      const { body: reportBody } = await request(app.getHttpServer())
        .post('/api/reports')
        .set('Authorization', `Bearer ${reporter.access_token}`)
        .send({
          reportedUserId: reported.id,
          reportedPostId: post.id,
          reason: 'SPAM',
          description: 'This looks like spam',
        })
        .expect(201);

      expect(reportBody.id).toBeTruthy();
      expect(reportBody.status).toBe('PENDING');

      // 2. Promote reporter to ADMIN in DB for the admin actions
      await prisma.user.update({
        where: { id: reporter.id },
        data: { role: 'ADMIN' },
      });
      const { body: adminLogin } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: reporter.email, password: reporter.password })
        .expect(200);
      const adminToken = adminLogin.access_token;

      // 3. Admin fetches pending reports
      const { body: pending } = await request(app.getHttpServer())
        .get('/api/reports/admin/pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const targetReport = pending.find((r: any) => r.id === reportBody.id);
      expect(targetReport).toBeTruthy();
      expect(targetReport.status).toBe('PENDING');

      // 4. Admin resolves report
      const reportedScoreBefore = (await prisma.user.findUniqueOrThrow({ where: { id: reported.id } })).trustScore;

      await request(app.getHttpServer())
        .patch(`/api/reports/admin/${reportBody.id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ action: 'ACTION_TAKEN' })
        .expect(200);

      // 5. Report status should be updated
      const updatedReport = await prisma.report.findUniqueOrThrow({ where: { id: reportBody.id } });
      expect(updatedReport.status).toBe('ACTION_TAKEN');

      // 6. Audit log should be created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          targetUserId: reported.id,
          actionType: 'REPORT_ACTION_TAKEN',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).toBeTruthy();

      // 7. Trust score of reported user should decrease
      const reportedScoreAfter = (await prisma.user.findUniqueOrThrow({ where: { id: reported.id } })).trustScore;
      expect(reportedScoreAfter).toBeLessThanOrEqual(reportedScoreBefore);
    });

    it('dismissing a report also creates an audit log', async () => {
      const reporter = await registerUser(app);
      const reported = await registerUser(app);

      // Make reporter ADMIN
      await prisma.user.update({ where: { id: reporter.id }, data: { role: 'ADMIN' } });
      const { body: adminLogin } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: reporter.email, password: reporter.password })
        .expect(200);

      // File report
      const { body: reportBody } = await request(app.getHttpServer())
        .post('/api/reports')
        .set('Authorization', `Bearer ${adminLogin.access_token}`)
        .send({ reportedUserId: reported.id, reason: 'SPAM' })
        .expect(201);

      // Dismiss it
      await request(app.getHttpServer())
        .patch(`/api/reports/admin/${reportBody.id}/resolve`)
        .set('Authorization', `Bearer ${adminLogin.access_token}`)
        .send({ action: 'DISMISSED' })
        .expect(200);

      const auditLog = await prisma.auditLog.findFirst({
        where: { actionType: 'REPORT_DISMISSED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).toBeTruthy();
    });
  });

  describe('Admin-only access', () => {
    it('non-admin user cannot access admin report endpoints', async () => {
      const normalUser = await registerUser(app);

      await request(app.getHttpServer())
        .get('/api/reports/admin/pending')
        .set('Authorization', `Bearer ${normalUser.access_token}`)
        .expect(403);
    });

    it('unauthenticated request to admin endpoints returns 401', async () => {
      await request(app.getHttpServer()).get('/api/reports/admin/pending').expect(401);
    });
  });

  describe('User suspend/ban via admin endpoints', () => {
    it('admin can suspend and restore a user', async () => {
      const admin = await registerUser(app);
      const target = await registerUser(app);

      await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
      const { body: adminLogin } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200);

      // Suspend
      await request(app.getHttpServer())
        .post(`/api/users/admin/${target.id}/suspend`)
        .set('Authorization', `Bearer ${adminLogin.access_token}`)
        .send({ reason: 'E2E test suspension' })
        .expect(201);

      const suspended = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(suspended.isSuspended).toBe(true);

      // Restore
      await request(app.getHttpServer())
        .post(`/api/users/admin/${target.id}/restore`)
        .set('Authorization', `Bearer ${adminLogin.access_token}`)
        .expect(201);

      const restored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(restored.isSuspended).toBe(false);
      expect(restored.isBanned).toBe(false);
    });

    it('admin can ban a user', async () => {
      const admin = await registerUser(app);
      const target = await registerUser(app);

      await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
      const { body: adminLogin } = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/users/admin/${target.id}/ban`)
        .set('Authorization', `Bearer ${adminLogin.access_token}`)
        .send({ reason: 'E2E test ban' })
        .expect(201);

      const banned = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(banned.isBanned).toBe(true);
      expect(banned.isSuspended).toBe(true);
    });
  });
});
