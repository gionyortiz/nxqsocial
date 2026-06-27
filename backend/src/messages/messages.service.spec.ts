import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  block: { findFirst: jest.fn() },
  conversationParticipant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  conversation: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  directMessage: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  user: {
    findFirst: jest.fn(),
  },
};

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(MessagesService);
    jest.clearAllMocks();
  });

  it('blocks conversation creation when users are blocked', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u2',
      username: 'peer',
      verificationStatus: 'BASIC',
      profile: { displayName: 'Peer', avatarUrl: null },
    });
    mockPrisma.block.findFirst.mockResolvedValue({ id: 'b1' });

    await expect(service.createConversation('u1', 'peer')).rejects.toThrow(ForbiddenException);
  });

  it('returns existing 1:1 conversation when present', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u2',
      username: 'peer',
      verificationStatus: 'BASIC',
      profile: { displayName: 'Peer', avatarUrl: null },
    });
    mockPrisma.block.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'c1', _count: { participants: 2 } });

    const result = await service.createConversation('u1', 'peer');
    expect(result).toEqual({ id: 'c1' });
  });

  it('uses transaction when sending a message', async () => {
    mockPrisma.conversationParticipant.findUnique.mockResolvedValue({ id: 'cp-1' });
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    mockPrisma.block.findFirst.mockResolvedValue(null);

    const createdAt = new Date('2026-06-27T10:00:00.000Z');
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb({
      directMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'm1',
          content: 'hello',
          createdAt,
          sender: {
            id: 'u1',
            username: 'me',
            verificationStatus: 'BASIC',
            profile: { displayName: 'Me', avatarUrl: null },
          },
        }),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationParticipant: { update: jest.fn().mockResolvedValue({}) },
    }));

    const result = await service.sendMessage('u1', 'c1', 'hello');
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.id).toBe('m1');
  });
});
