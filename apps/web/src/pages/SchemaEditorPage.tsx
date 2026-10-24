import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Column, FieldType, Role, TableSchema } from '../lib/types';
import { useAuthStore } from '../stores/authStore';
import { Icon } from '../components/Icons';

const TYPES: FieldType[] = ['text', 'number', 'date', 'image', 'option', 'formula', 'autonumber'];

const TYPE_LABEL: Record<string, string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  image: '图片',
  option: '选项',
  formula: '公式',
  autonumber: '自动序号',
};

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
    if (out.type === 'formula' || out.type === 'autonumber') {
      out.editableByRoles = [];
    }
    return out;
  });
}

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span className="switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
    </label>
  );
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
        <span className="empty-icon"><Icon name="alert-triangle" size={24} /></span>
        <span className="empty-title">仅管理员可编辑 schema</span>
        <Link to={`/tables/${id}`}>返回表格</Link>
      </div>
    );
  }
  if (!draft) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 24, marginBottom: 18 }} />
        <div className="col-list">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  function patchCol(idx: number, patch: Partial<Column>) {
    const next = structuredClone(draft!);
    next.columns[idx] = { ...next.columns[idx]!, ...patch } as Column;
    if (next.columns[idx]!.type === 'formula' || next.columns[idx]!.type === 'autonumber') {
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
      <div className="page-header">
        <h2>
          <Icon name="sliders" size={20} style={{ color: 'var(--primary-600)' }} />
          列配置
        </h2>
        <div className="subtitle">
          {draft.name} · 共 {draft.columns.length} 列 · 开启「二级菜单」的列将收纳到每行操作列的更多字段弹层中
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: -4 }}>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button className="ghost">取消</button>
        </Link>
        <button
          className="primary"
          disabled={mut.isPending}
          onClick={() => mut.mutate(draft)}
        >
          {mut.isPending ? (
            <><span className="spinner" style={{ borderColor: 'rgba(255,255,255,.5)', borderTopColor: '#fff' }} /> 保存中…</>
          ) : (
            <><Icon name="check" size={15} /> 保存</>
          )}
        </button>
      </div>
      {error && <div className="error-msg"><Icon name="alert-triangle" size={14} /> {error}</div>}

      <div className="option-set" style={{ marginBottom: 16 }}>
        <label>表名</label>
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          style={{ maxWidth: 320 }}
        />
      </div>

      <div className="col-list stagger">
        {draft.columns.map((col, idx) => (
          <ColEditor
            key={idx}
            col={col}
            optionSets={draft.optionSets}
            onPatch={(p) => patchCol(idx, p)}
            onRemove={() => removeCol(idx)}
            onMove={(d) => moveCol(idx, d)}
            canMoveUp={idx > 0}
            canMoveDown={idx < draft.columns.length - 1}
          />
        ))}
      </div>

      <button onClick={addCol} className="ghost" style={{ marginTop: 4 }}>
        <Icon name="plus" size={15} /> 添加列
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
  canMoveUp,
  canMoveDown,
}: {
  col: Column;
  optionSets: Record<string, string[]>;
  onPatch: (p: Partial<Column>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const locked = col.type === 'formula' || col.type === 'autonumber';
  return (
    <div className="col-item">
      <div className="field" style={{ flex: '1 1 150px', minWidth: 130 }}>
        <label>ID</label>
        <input
          className="mono"
          value={col.id}
          onChange={(e) => onPatch({ id: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })}
          disabled={locked}
        />
      </div>
      <div className="field" style={{ flex: '1 1 150px', minWidth: 130 }}>
        <label>名称</label>
        <input value={col.name} onChange={(e) => onPatch({ name: e.target.value })} />
      </div>
      <div className="field" style={{ minWidth: 110 }}>
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
            if (type === 'autonumber') {
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
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ minWidth: 80 }}>
        <label>可见</label>
        <Toggle checked={col.visible} onChange={(v) => onPatch({ visible: v })} label={col.visible ? '显示' : '隐藏'} />
      </div>
      <div className="field" style={{ minWidth: 96 }}>
        <label>二级菜单</label>
        <Toggle
          checked={!!col.overflow}
          disabled={!col.visible}
          onChange={(v) => onPatch({ overflow: v } as Partial<Column>)}
          label={col.overflow ? '收纳' : '主表'}
        />
      </div>
      <div className="field" style={{ minWidth: 80 }}>
        <label>必填</label>
        <Toggle checked={!!col.required} disabled={locked} onChange={(v) => onPatch({ required: v })} label={col.required ? '必填' : '选填'} />
      </div>
      <div className="field" style={{ minWidth: 150 }}>
        <label>可编辑角色</label>
        <div className="editable-row">
          {(['admin', 'user'] as Role[]).map((r) => {
            const checked = col.editableByRoles.includes(r);
            return (
              <label key={r} style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: locked ? 'not-allowed' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={(e) => {
                    const set = new Set(col.editableByRoles);
                    if (e.target.checked) set.add(r);
                    else set.delete(r);
                    onPatch({ editableByRoles: [...set] });
                  }}
                />
                <span style={{ fontSize: 12 }}>{r === 'admin' ? '管理员' : '录入员'}</span>
              </label>
            );
          })}
        </div>
      </div>

      {col.type === 'option' && (
        <div className="field" style={{ minWidth: 130 }}>
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
        <div className="field" style={{ minWidth: 80 }}>
          <label>多图</label>
          <Toggle
            checked={!!(col as Extract<Column, { type: 'image' }>).multiple}
            onChange={(v) => onPatch({ multiple: v } as Partial<Column>)}
            label={(col as Extract<Column, { type: 'image' }>).multiple ? '多张' : '单张'}
          />
        </div>
      )}

      {col.type === 'formula' && (
        <FormulaEditor col={col as Extract<Column, { type: 'formula' }>} onPatch={onPatch} />
      )}

      <div className="col-actions">
        <button onClick={() => onMove(-1)} disabled={!canMoveUp} title="上移" aria-label="上移">
          <Icon name="chevron-up" size={13} />
        </button>
        <button onClick={() => onMove(1)} disabled={!canMoveDown} title="下移" aria-label="下移">
          <Icon name="chevron-down" size={13} />
        </button>
        <button className="danger" onClick={onRemove} title="删除列" aria-label="删除列">
          <Icon name="trash" size={12} />
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
  const [ok, setOk] = useState(false);
  return (
    <>
      <div className="field" style={{ flex: 1, minWidth: 240 }}>
        <label>
          公式 <span className="muted">(用 {`{{col_id}}`} 引用其他列)</span>
        </label>
        <input
          className="mono"
          value={col.formula}
          placeholder="例: DATEADD({{report_date}}, 7, 'day')"
          onChange={(e) => {
            setPreview(null);
            onPatch({ formula: e.target.value } as Partial<Column>);
          }}
          onBlur={async () => {
            if (!col.formula) { setPreview(null); return; }
            const r = await api.validateFormula(col.formula);
            if (!r.ok) { setOk(false); setPreview(`语法错误: ${r.error}`); }
            else { setOk(true); setPreview('语法正确'); }
          }}
        />
        {preview && (
          <div style={{ marginTop: 3, fontSize: 11.5, color: ok ? 'var(--primary-700)' : 'var(--danger-600)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name={ok ? 'check' : 'x'} size={12} /> {preview}
          </div>
        )}
      </div>
      <div className="field" style={{ flex: 1 }}>
        <label>依赖列</label>
        <input
          className="mono"
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
