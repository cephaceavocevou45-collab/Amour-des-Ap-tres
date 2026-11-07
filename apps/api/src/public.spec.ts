import { PublicController } from './public';

describe('PublicController', () => {
  const prisma = { person: { findMany: jest.fn() } } as any;
  const controller = new PublicController(prisma, { requireRecentProof: jest.fn() } as any);

  it('publishes the corrected parish leader identity and responsive portrait asset', () => {
    expect(controller.leader()).toEqual({
      name: 'Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien',
      title: 'Chargé paroissial',
      photoUrl: 'leader-720.webp',
      welcome: expect.any(String),
    });
    expect(controller.leader().welcome).toContain('paroisse Amour des Apôtres');
  });

  it('publishes active point 06 presenters created by the administrator', async () => {
    prisma.person.findMany.mockResolvedValueOnce([{
      id: 'presenter-1',
      firstName: 'Jean',
      lastName: 'SEWADE',
      grade: 'Évangéliste',
      roles: [{ role: 'PRESENTATION_THEME' }],
    }]);

    await expect(controller.getTeam()).resolves.toEqual([{
      id: 'presenter-1',
      name: 'SEWADE Jean',
      grade: 'Évangéliste',
      roles: ['PRESENTATION_THEME'],
    }]);
  });
});
