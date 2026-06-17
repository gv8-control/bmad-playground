import { faker } from '@faker-js/faker';

export type TestRepository = {
  id: string;
  url: string;
  name: string;
  owner: string;
  defaultBranch: string;
  sizeKb: number;
};

export type TestConversation = {
  id: string;
  repositoryId: string;
  title: string;
  status: 'provisioning' | 'ready' | 'active' | 'idle' | 'error';
};

export const createRepository = (overrides: Partial<TestRepository> = {}): TestRepository => {
  const owner = overrides.owner ?? faker.internet.username().toLowerCase();
  const name = overrides.name ?? faker.word.noun().toLowerCase();
  return {
    id: faker.string.uuid(),
    url: `https://github.com/${owner}/${name}`,
    name,
    owner,
    defaultBranch: 'main',
    sizeKb: faker.number.int({ min: 1_000, max: 50_000 }),
    ...overrides,
  };
};

export const createConversation = (overrides: Partial<TestConversation> = {}): TestConversation => ({
  id: faker.string.uuid(),
  repositoryId: faker.string.uuid(),
  title: faker.lorem.words(3),
  status: 'provisioning',
  ...overrides,
});
