export interface UserContext {
  id: string;
  githubLogin: string;
  name: string | null;
  email: string | null;
  active: boolean;
}
