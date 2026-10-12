import { PublicController } from './public';

describe('PublicController', () => {
  const prisma = { person: { findMany: jest.fn() } } as any;
  const controller = new PublicController(prisma);

  it('publishes the corrected parish leader identity and responsive portrait asset', () => {
    expect(controller.leader()).toEqual({
      name: 'Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien',
      title: 'Chargé paroissial',
      photoUrl: 'leader-720.webp',
      welcome: expect.any(String),
    });
    expect(controller.leader().welcome).toContain('paroisse Amour des Apôtres');
  });
});
