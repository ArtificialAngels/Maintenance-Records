import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Column, FieldType, Role, TableSchema } from '../lib/types';
import { useAuthStore } from '../stores/authStore';

const TYPES: FieldType[] = ['text', 'number', 'date', 'image', 'option', 'formula'];

function emptyColumn(): Column {
  return {
    id: 'new_col',
    name: '新列',
    type: 'text',
    visible: true,
    editableByRoles: ['admin', 'user'],
  };
}

function normalizeColumns(input: Column[]): Column[] {
  return input.map((c) => {
    const out: Column = {
      ...c,
      id: c.id || `col_${Math.random().toString(36).slice(2, 8)}`,
      name: c.name || '未命名',
    };
    if (out.type === 'formula') {
      out.editableByRoles = [];
    }
    return out;
  });
}

export function SchemaEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TableSchema | null>(null);

  const schemaQ = useQuery({
    queryKey: ['schema', id],
    queryFn: () => api.getTable(id).then((r) => r.schema),
  });

  useEffect(() => {
    if (schemaQ.data) setDraft(structuredClone(schemaQ.data));
  }, [schemaQ.data]);

  const mut = useMutation({
    mutationFn: (next: TableSchema) =>
      api.updateSchema(id, {
        name: next.name,
        columns: next.columns,
        optionSets: next.optionSets,
      }),
    onSuccess: (r) => {
      qc.setQueryData(['schema', id], r.schema);
      setDraft(r.schema);
      navigate(`/tables/${id}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  if (user.role !== 'admin') {
    return (
      <div className="empty-state">
        仅管理员可编辑 schema。<Link to={`/tables/${id}`}>返回</Link>
      </div>
    );
  }
  if (!draft) return <div className="muted">加载中...</div>;

  function patchCol(idx: number, patch: Partial<Column>) {
    const next = structuredClone(draft!);
    next.columns[idx] = { ...next.columns[idx]!, ...patch } as Column;
    if (next.columns[idx]!.type === 'formula') {
      next.columns[idx]!.editableByRoles = [];
    }
    setDraft(next);
  }

  function addCol() {
    const next = structuredClone(draft!);
    next.columns.push(emptyColumn());
    setDraft(next);
  }

  function removeCol(idx: number) {
    const next = structuredClone(draft!);
    next.columns.splice(idx, 1);
    setDraft(next);
  }

  function moveCol(idx: number, dir: -1 | 1) {
    const next = structuredClone(draft!);
    const j = idx + dir;
    if (j < 0 || j >= next.columns.length) return;
    const tmp = next.columns[idx]!;
    next.columns[idx] = next.columns[j]!;
    next.columns[j] = tmp;
    setDraft(next);
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>列配置 — {draft.name}</h2>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button>取消</button>
        </Link>
        <button
          className="primary"
          disabled={mut.isPending}
          onClick={() => mut.mutate(draft)}
        >
          {mut.isPending ? '保存中...' : '保存'}
        </button>
      </div>
      {error && <div className="error-msg">{error}</div>}

      <div style={{ marginBottom: 16 }}>
        <label>表名</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      <div className="col-list">
        {draft.columns.map((col, idx) => (
          <ColEditor
            key={idx}
            col={col}
            optionSets={draft.optionSets}
            onPatch={(p) => patchCol(idx, p)}
            onRemove={() => removeCol(idx)}
            onMove={(d) => moveCol(idx, d)}
          />
        ))}
      </div>

      <button onClick={addCol} style={{ marginTop: 12 }}>
        + 添加列
      </button>
    </div>
  );
}

function ColEditor({
  col,
  optionSets,
  onPatch,
  onRemove,
  onMove,
}: {
  col: Column;
  optionSets: Record<string, string[]>;
  onPatch: (p: Partial<Column>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="col-item">
      <div style={{ flex: 1 }}>
        <label>ID</label>
        <input
          value={col.id}
          onChange={(e) => onPatch({ id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
          disabled={col.type === 'formula'}
        />
      </div>
      <div style={{ flex: 1 }}>
        <label>名称</label>
        <input value={col.name} onChange={(e) => onPatch({ name: e.target.value })} />
      </div>
      <div>
        <label>类型</label>
        <select
          value={col.type}
          onChange={(e) => {
            const type = e.target.value as FieldType;
            const next: Column = { ...col, type } as Column;
            if (type === 'formula') {
              (next as Extract<Column, { type: 'formula' }>).formula = '';
              (next as Extract<Column, { type: 'formula' }>).dependsOn = [];
              next.editableByRoles = [];
            }
            if (type === 'option') {
              (next as Extract<Column, { type: 'option' }>).optionSetId =
                Object.keys(optionSets)[0] ?? '';
            }
            onPatch(next);
          }}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>可见</label>
        <input
          type="checkbox"
          checked={col.visible}
          onChange={(e) => onPatch({ visible: e.target.checked })}
          style={{ width: 'auto' }}
        />
      </div>
      <div>
        <label>必填</label>
        <input
          type="checkbox"
          checked={!!col.required}
          onChange={(e) => onPatch({ required: e.target.checked })}
          style={{ width: 'auto' }}
        />
      </div>
      <div>
        <label>可编辑角色</label>
        <div className="editable-row">
          {(['admin', 'user'] as Role[]).map((r) => {
            const checked = col.editableByRoles.includes(r);
            return (
              <label key={r} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={col.type === 'formula'}
                  onChange={(e) => {
                    const set = new Set(col.editableByRoles);
                    if (e.target.checked) set.add(r);
                    else set.delete(r);
                    onPatch({ editableByRoles: [...set] });
                  }}
                  style={{ width: 'auto' }}
                />
                <span style={{ fontSize: 12 }}>{r}</span>
              </label>
            );
          })}
        </div>
      </div>

      {col.type === 'option' && (
        <div>
          <label>选项集</label>
          <select
            value={(col as Extract<Column, { type: 'option' }>).optionSetId}
            onChange={(e) =>
              onPatch({ optionSetId: e.target.value } as Partial<Column>)
            }
          >
            {Object.keys(optionSets).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      )}

      {col.type === 'image' && (
        <div>
          <label>多张</label>
          <input
            type="checkbox"
            checked={!!(col as Extract<Column, { type: 'image' }>).multiple}
            onChange={(e) =>
              onPatch({ multiple: e.target.checked } as Partial<Column>)
            }
            style={{ width: 'auto' }}
          />
        </div>
      )}

      {col.type === 'formula' && (
        <FormulaEditor col={col as Extract<Column, { type: 'formula' }>} onPatch={onPatch} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button onClick={() => onMove(-1)} title="上移">↑</button>
        <button onClick={() => onMove(1)} title="下移">↓</button>
        <button className="danger" onClick={onRemove} title="删除列">
          ×
        </button>
      </div>
    </div>
  );
}

function FormulaEditor({
  col,
  onPatch,
}: {
  col: Extract<Column, { type: 'formula' }>;
  onPatch: (p: Partial<Column>) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
        <div style={{ flex: 1, minWidth: 240 }}>
          <label>
            公式 <span className="muted">(用 {`{{col_id}}`} 引用其他列)</span>
          </label>
          <input
            value={col.formula}
            placeholder="例: DATEADD({{report_date}}, 7, 'day')"
            onChange={(e) =>
              onPatch({ formula: e.target.value } as Partial<Column>)
            }
            onBlur={async () => {
              const r = await api.validateFormula(col.formula);
              if (!r.ok) setPreview(`❌ ${r.error}`);
              else setPreview('✅ 语法正确');
            }}
          />
          {preview && <div className="muted" style={{ marginTop: 2 }}>{preview}</div>}
        </div>
      <div style={{ flex: 1 }}>
        <label>依赖列</label>
        <input
          value={col.dependsOn.join(',')}
          onChange={(e) =>
            onPatch({
              dependsOn: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            } as Partial<Column>)
          }
        />
      </div>
    </>
  );
}

// silence unused
void normalizeColumns;