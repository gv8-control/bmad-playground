import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('returns 200 { status: ok }', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;

    controller.health(res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });
});
