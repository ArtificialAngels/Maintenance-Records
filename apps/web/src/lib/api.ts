import type {
  AuditEntry,
  Column,
  Row,
  TableSchema,
  User,
} from './types';

const BASE = '/api';

class HttpError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message);
  }
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('mr.token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    credentials: 'include',
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(BASE + path, init);
  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    const msg =
      typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : res.statusText;
    throw new HttpError(res.status, payload, msg);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---- Auth ----
export const api = {
  async listUsers(): Promise<User[]> {
    const r = await request<{ users: User[] }>('GET', '/auth/users');
    return r.users;
  },
  async login(userId: string): Promise<{ token: string; user: User }> {
    return request('POST', '/auth/login', { userId });
  },
  async me(): Promise<{ user: User }> {
    return request('GET', '/me');
  },

  // ---- Tables ----
  async listTables() {
    return request<{ tables: { id: string; name: string; schemaVersion: number; columnCount: number }[] }>(
      'GET',
      '/tables',
    );
  },
  async getTable(id: string) {
    return request<{ schema: TableSchema }>('GET', `/tables/${id}`);
  },
  async createTable(schema: TableSchema) {
    return request<{ schema: TableSchema }>('POST', '/tables', schema);
  },
  async updateSchema(id: string, patch: Partial<TableSchema>) {
    return request<{ schema: TableSchema }>('PATCH', `/tables/${id}/schema`, patch);
  },

  // ---- Options ----
  async getOptionSets(id: string) {
    return request<{ optionSets: Record<string, string[]> }>('GET', `/tables/${id}/option-sets`);
  },
  async setOptionSet(id: string, key: string, values: string[]) {
    return request<{ key: string; values: string[] }>(
      'PATCH',
      `/tables/${id}/option-sets/${encodeURIComponent(key)}`,
      { values },
    );
  },
  async listOptionSetKeys(id: string) {
    return request<{ keys: string[] }>('GET', `/tables/${id}/option-set-keys`);
  },

  // ---- Rows ----
  async listRows(id: string) {
    return request<{ rows: Row[] }>('GET', `/tables/${id}/rows`);
  },
  async createRow(id: string, values: Record<string, unknown>) {
    return request<{ row: Row }>('POST', `/tables/${id}/rows`, values);
  },
  async updateRow(id: string, rowId: string, values: Record<string, unknown>) {
    return request<{ row: Row }>('PATCH', `/tables/${id}/rows/${rowId}`, values);
  },
  async deleteRow(id: string, rowId: string) {
    return request<{ ok: true }>('DELETE', `/tables/${id}/rows/${rowId}`);
  },

  // ---- Images ----
  async uploadImage(
    tableId: string,
    rowId: string,
    colId: string,
    file: File,
  ): Promise<{ asset: { assetId: string; ext: string; originalName: string } }> {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('mr.token');
    const res = await fetch(
      `${BASE}/tables/${tableId}/uploads/${rowId}/${colId}`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || '上传失败');
    }
    return res.json();
  },
  imageUrl(tableId: string, rowId: string, colId: string, assetId: string): string {
    return `${BASE}/tables/${tableId}/assets/${rowId}/${colId}/${assetId}`;
  },

  // ---- Formulas ----
  async validateFormula(formula: string) {
    return request<{ ok: true } | { ok: false; error: string }>(
      'POST',
      '/formulas/validate',
      { formula },
    );
  },
  async previewFormula(formula: string, refs: Record<string, unknown>) {
    return request<{ result?: unknown; error?: string }>(
      'POST',
      '/formulas/preview',
      { formula, refs },
    );
  },

  // ---- Audit ----
  async listAudit(): Promise<{ entries: AuditEntry[] }> {
    return request('GET', '/audit');
  },

  // ---- Stats ----
  async getStats(tableId: string) {
    return request<{
      tableId: string;
      totalRows: number;
      totalHours: number;
      aggregations: { groupBy: string; buckets: { key: string; count: number; totalHours: number }[] }[];
    }>('GET', `/stats/${tableId}`);
  },
};

export { HttpError };

// Re-export type Column for backwards use
export type { Column };