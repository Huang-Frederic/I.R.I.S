import { describe, it, expect } from 'vitest';
import {
  apiError,
  unauthorizedResponse,
  notFoundResponse,
  validationResponse,
  serverErrorResponse,
} from './api-response';

async function readBody(res: Response) {
  const json = await res.json();
  return { status: res.status, body: json };
}

describe('apiError', () => {
  it('returns ok:false with the given code and default 400 status', async () => {
    const res = apiError('something_broke');
    const { status, body } = await readBody(res);
    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, error: 'something_broke' });
  });

  it('respects custom status', async () => {
    const res = apiError('teapot', { status: 418 });
    const { status, body } = await readBody(res);
    expect(status).toBe(418);
    expect(body.error).toBe('teapot');
  });

  it('includes message when provided', async () => {
    const res = apiError('card_not_found', { status: 404, message: 'Carte introuvable' });
    const { body } = await readBody(res);
    expect(body.message).toBe('Carte introuvable');
  });

  it('includes details when provided', async () => {
    const res = apiError('validation', { details: { field: 'set_code' } });
    const { body } = await readBody(res);
    expect(body.details).toEqual({ field: 'set_code' });
  });

  it('omits message and details when not provided', async () => {
    const res = apiError('something_broke');
    const { body } = await readBody(res);
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('details');
  });
});

describe('shorthand helpers', () => {
  it('unauthorizedResponse → 401 with code "unauthorized"', async () => {
    const { status, body } = await readBody(unauthorizedResponse());
    expect(status).toBe(401);
    expect(body.error).toBe('unauthorized');
  });

  it('notFoundResponse → 404 with code "<resource>_not_found"', async () => {
    const { status, body } = await readBody(notFoundResponse('card'));
    expect(status).toBe(404);
    expect(body.error).toBe('card_not_found');
  });

  it('validationResponse → 400 with code "validation" + message', async () => {
    const { status, body } = await readBody(validationResponse('missing field'));
    expect(status).toBe(400);
    expect(body.error).toBe('validation');
    expect(body.message).toBe('missing field');
  });

  it('serverErrorResponse → 500 with details.underlying = message', async () => {
    const { status, body } = await readBody(serverErrorResponse(new Error('db down')));
    expect(status).toBe(500);
    expect(body.error).toBe('server_error');
    expect((body.details as { underlying: string }).underlying).toBe('db down');
  });

  it('serverErrorResponse accepts plain strings too', async () => {
    const { body } = await readBody(serverErrorResponse('raw string'));
    expect((body.details as { underlying: string }).underlying).toBe('raw string');
  });
});
