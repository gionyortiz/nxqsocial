import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AuditService);
    jest.clearAllMocks();
  });

  it('creates an audit log entry', async () => {
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

    await service.log({
      adminId: 'admin-1',
      action: 'REPORT_ACTION_TAKEN',
      targetUserId: 'user-1',
      reason: 'Spam',
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminId: 'admin-1',
          actionType: 'REPORT_ACTION_TAKEN',
          targetUserId: 'user-1',
        }),
      }),
    );
  });

  it('retrieves recent logs in descending order', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    await service.getRecentLogs(50);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' }, take: 50 }),
    );
  });

  it('retrieves logs filtered by targetUserId', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    await service.getLogsForUser('user-abc');
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { targetUserId: 'user-abc' } }),
    );
  });
});
