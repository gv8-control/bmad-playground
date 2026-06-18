import { databaseSchemas } from './database-schemas';

describe('databaseSchemas', () => {
  it('should work', () => {
    expect(databaseSchemas()).toEqual('database-schemas');
  });
});
