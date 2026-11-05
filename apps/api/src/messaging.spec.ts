import { MessagingService } from './messaging';
import { PrismaService } from './prisma.service';

describe('parish messaging', () => {
  it('lets designated responders list active faithful profiles', async () => {
    const faithful = [{ id: 'faithful-1', fullName: 'Marie Test', photoUrl: 'data:image/png;base64,abc', grade: 'Membre' }];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'SECRETAIRE_PROGRAMME', active: true, canRespondMessages: true }),
        findMany: jest.fn().mockResolvedValue(faithful)
      }
    } as unknown as PrismaService;

    await expect(new MessagingService(prisma).faithfulRecipients('responder-1', 'SECRETAIRE_PROGRAMME')).resolves.toEqual(faithful);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'FIDELE', active: true },
      select: { id: true, fullName: true, photoUrl: true, grade: true },
      orderBy: [{ fullName: 'asc' }]
    });
  });

  it('does not expose the faithful directory to unassigned responders', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'SECRETAIRE_PRESENCE', active: true, canRespondMessages: true }) } } as unknown as PrismaService;

    await expect(new MessagingService(prisma).faithfulRecipients('member-1', 'SECRETAIRE_PRESENCE')).rejects.toMatchObject({ status: 403 });
  });

  it('starts a conversation from a designated responder and notifies the faithful recipient', async () => {
    const conversation = { id: 'conversation-1' };
    const tx = {
      conversation: { create: jest.fn().mockResolvedValue(conversation) },
      notification: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      user: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ role: 'SECRETAIRE_PROGRAMME', active: true, canRespondMessages: true })
          .mockResolvedValueOnce({ id: 'faithful-1', role: 'FIDELE', active: true })
      },
      $transaction: jest.fn((work: (transaction: typeof tx) => unknown) => work(tx))
    } as unknown as PrismaService;

    await expect(new MessagingService(prisma).openForFaithful('responder-1', 'SECRETAIRE_PROGRAMME', 'faithful-1', {
      subject: '  Information  ',
      message: '  Bonjour, voici une information.  '
    })).resolves.toEqual(conversation);
    expect(tx.conversation.create).toHaveBeenCalledWith({
      data: {
        subject: 'Information',
        requesterId: 'faithful-1',
        assignedToId: 'responder-1',
        messages: { create: { body: 'Bonjour, voici une information.', senderId: 'responder-1' } }
      }
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'faithful-1',
        title: 'Nouveau message de la paroisse',
        body: 'Un responsable de la paroisse vous a envoyé un message.',
        href: '/messages'
      }
    });

  });

  it('does not let a designated non-secretary bypass the responder role restriction', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'SECRETAIRE_PRESENCE', active: true, canRespondMessages: true }) } } as unknown as PrismaService;
    await expect(new MessagingService(prisma).faithfulRecipients('responder-1', 'SECRETAIRE_PRESENCE')).rejects.toMatchObject({ status: 403 });
  });

  it('lets administrators monitor conversations but not reply to a faithful', async () => {
    const tx = { message: { create: jest.fn() }, conversation: { update: jest.fn() }, user: { findMany: jest.fn() }, notification: { createMany: jest.fn() } };
    const prisma = {
      conversation: { findUnique: jest.fn().mockResolvedValue({ id: 'conversation-1', requesterId: 'faithful-1', assignedToId: 'secretary-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN', active: true, canRespondMessages: false }) },
      $transaction: jest.fn((work: (transaction: typeof tx) => unknown) => work(tx))
    } as unknown as PrismaService;
    await expect(new MessagingService(prisma).reply('admin-1', 'ADMIN', 'conversation-1', { message: 'Réponse administrative.' }))
      .rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
