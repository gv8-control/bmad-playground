import { faker } from '@faker-js/faker';

export type TestUser = {
  id: string;
  githubId: string;
  githubUsername: string;
  email: string;
  name: string;
  avatarUrl: string;
};

export const createUser = (overrides: Partial<TestUser> = {}): TestUser => ({
  id: faker.string.uuid(),
  githubId: faker.string.numeric(8),
  githubUsername: faker.internet.username().toLowerCase(),
  email: faker.internet.email(),
  name: faker.person.fullName(),
  avatarUrl: faker.image.avatarGitHub(),
  ...overrides,
});
