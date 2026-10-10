import { SafeExceptionFilter } from './safe-exception.filter';
import { BadRequestException } from '@nestjs/common';

function host() {
  const response: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const args: any = { switchToHttp: () => ({ getResponse: () => response }) };
  return { response, args };
}

describe('SafeExceptionFilter', () => {
  it('hides internal exception details in server errors', () => {
    const filter = new SafeExceptionFilter(), { response, args } = host();
    filter.catch(new Error('table User private/path SECRET_VALUE'), args);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 500, message: 'Une erreur interne est survenue.' });
    expect(JSON.stringify(response.json.mock.calls)).not.toMatch(/User|private\/path|SECRET_VALUE/);
  });
  it('preserves safe client validation errors', () => {
    const filter = new SafeExceptionFilter(), { response, args } = host();
    filter.catch(new BadRequestException('Saisie invalide.'), args);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ statusCode: 400, message: 'Saisie invalide.', error: 'Bad Request' });
  });
  it('redacts schema, filesystem and environment details even if a client error includes them', () => {
    const filter = new SafeExceptionFilter(), { response, args } = host();
    filter.catch(new BadRequestException({ message: ['relation User does not exist at D:\\private\\project', 'DATABASE_URL is missing'] }), args);
    expect(response.json).toHaveBeenCalledWith({ message: ['Requête impossible.', 'Requête impossible.'] });
  });
});
