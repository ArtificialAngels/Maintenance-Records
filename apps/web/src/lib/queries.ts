import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { TableAccess, TableSchema } from './types';

/**
 * 表格 schema 的缓存键。
 *
 * ⚠️ 所有读这张表的页面（表格页 / 列配置 / 选项集 / 统计）必须共用这一个键
 * **并且共用同一个 queryFn**。缓存是按 key 存的，如果某处存 `{schema, access}`、
 * 另一处存裸 `TableSchema`，SPA 内跳转时就会拿到形状不对的缓存直接渲染崩溃
 * （历史 bug：从表格页点「列配置」白屏，必须 F5 才能打开）。
 */
export const schemaKey = (id: string) => ['schema', id] as const;

/** `GET /api/tables/:id` 的响应：schema + 当前用户对这张表的权限。 */
export interface TableQueryData {
  schema: TableSchema;
  access: TableAccess;
}

/**
 * 读取一张表的 schema（含表格级权限）。
 * 统一入口：不要在页面里自己写 `useQuery({ queryKey: ['schema', id], ... })`。
 */
export function useTableQuery(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: schemaKey(id),
    queryFn: () => api.getTable(id) as Promise<TableQueryData>,
    enabled: options?.enabled ?? true,
    // 同一份数据在页面间跳转时不必立刻重取：避免刚进页面就 background refetch
    // 把用户已经改了一半的草稿（列配置/选项集）覆盖回服务端版本。
    // 真正需要刷新时由 invalidateQueries(schemaKey(id)) 强制触发（忽略 staleTime）。
    staleTime: 15_000,
  });
}
