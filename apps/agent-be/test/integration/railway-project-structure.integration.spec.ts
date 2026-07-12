/**
 * Integration tests for Railway project structure (Story 4.2).
 *
 * Verifies:
 * - AC-1: Project contains Postgres and agent-be service shell
 * - AC-2: DATABASE_URL is provisioned on the Postgres service
 *
 * Run: yarn nx test-integration agent-be -- --testPathPattern=railway-project-structure
 */

import * as fs from 'fs';
import * as path from 'path';

const RAILWAY_GRAPHQL_ENDPOINT = 'https://backboard.railway.com/graphql/v2';
const WORKSPACE_ID = 'a1f06762-5fbd-431e-811f-5183b80576e5';
const EXPECTED_PROJECT_NAME = 'bmad-easy';

function getRailwayToken(): string {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;

  const envPath = path.resolve(process.cwd(), '.env.local');
  let envContent: string;
  try {
    envContent = fs.readFileSync(envPath, 'utf-8');
  } catch {
    throw new Error(`RAILWAY_TOKEN not found: .env.local does not exist at ${envPath}`);
  }
  const match = envContent.match(/^RAILWAY_TOKEN=(.+)$/m);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new Error('RAILWAY_TOKEN not found in process.env or .env.local');
  }

  return token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function railwayGraphQL(query: string): Promise<any> {
  const token = getRailwayToken();

  const response = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Railway API returned HTTP ${response.status}: ${response.statusText}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

  if (json.errors) {
    throw new Error(`Railway GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let projectData: any;
let projectId: string;

describe('Railway project structure — Story 4.2', () => {
  beforeAll(async () => {
    const data = await railwayGraphQL(`
      query {
        projects(workspaceId: "${WORKSPACE_ID}") {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const projectEdge = data.projects.edges.find((e: any) => e.node.name === EXPECTED_PROJECT_NAME);

    if (!projectEdge) {
      throw new Error(`Project "${EXPECTED_PROJECT_NAME}" not found in workspace ${WORKSPACE_ID}. Run Story 4.2 Tasks 1-2 first.`);
    }

    projectId = projectEdge.node.id;

    projectData = await railwayGraphQL(`
      query {
        project(id: "${projectId}") {
          id
          name
          services {
            edges {
              node {
                id
                name
              }
            }
          }
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `);
  });

  // --- AC-1: Project contains Postgres and agent-be service shell ---

  it('[P0] project named "bmad-easy" exists in the workspace', () => {
    expect(projectData.project.name).toBe(EXPECTED_PROJECT_NAME);
  });

  it('[P0] project contains at least two services', () => {
    const services = projectData.project.services.edges;
    expect(services.length).toBeGreaterThanOrEqual(2);
  });

  it('[P0] project contains a Postgres service', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceNames: string[] = projectData.project.services.edges.map((e: any) => e.node.name);
    const hasPostgres = serviceNames.some(
      (name) => name.toLowerCase().includes('postgres'),
    );
    expect(hasPostgres).toBe(true);
  });

  it('[P0] project contains an "agent-be" service', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceNames: string[] = projectData.project.services.edges.map((e: any) => e.node.name);
    expect(serviceNames).toContain('agent-be');
  });

  it('[P1] agent-be service has rootDirectory set to "apps/agent-be"', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envId = projectData.project.environments.edges.find((e: any) => e.node.name === 'production')?.node.id;
    if (!envId) throw new Error('Production environment not found in project');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentBeServiceId = projectData.project.services.edges.find((e: any) => e.node.name === 'agent-be')?.node.id;
    if (!agentBeServiceId) throw new Error('agent-be service not found in project');

    const data = await railwayGraphQL(`
      query {
        serviceInstance(serviceId: "${agentBeServiceId}", environmentId: "${envId}") {
          rootDirectory
        }
      }
    `);

    expect(data.serviceInstance.rootDirectory).toBe('apps/agent-be');
  });

  // --- AC-2: DATABASE_URL is provisioned ---

  it('[P0] DATABASE_URL is provisioned on the Postgres service', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envId = projectData.project.environments.edges.find((e: any) => e.node.name === 'production')?.node.id;
    if (!envId) throw new Error('Production environment not found in project');

    const postgresServiceId = projectData.project.services.edges.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.node.name.toLowerCase().includes('postgres'),
    )?.node.id;
    if (!postgresServiceId) throw new Error('Postgres service not found in project');

    const data = await railwayGraphQL(`
      query {
        variables(
          projectId: "${projectId}"
          environmentId: "${envId}"
          serviceId: "${postgresServiceId}"
        )
      }
    `);

    // The Railway variables query may return a JSON string or a parsed object
    const rawVars = data.variables as unknown;
    if (rawVars == null) {
      throw new Error('Railway API returned null for variables — no variables provisioned on the Postgres service');
    }
    const vars: Record<string, string> =
      typeof rawVars === 'string' ? JSON.parse(rawVars) : (rawVars as Record<string, string>);
    expect(vars).toHaveProperty('DATABASE_URL');
    expect(typeof vars.DATABASE_URL).toBe('string');
    expect((vars.DATABASE_URL as string).startsWith('postgresql://')).toBe(true);
  });
});
