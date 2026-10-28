import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { schemaKey, useTableQuery } from '../lib/queries';
import { pillStyle } from '../lib/colors';
import { useAuthStore } from '../stores/authStore';
import { Icon } from '../components/Icons';

export function OptionsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [newKey, setNewKey] = useState('');
  const [newValues, setNewValues] = useState('');
  const [error, setError] = useState<string | null>(null);

  const schemaQ = useTableQuery(id, { enabled: user.role === 'admin' });

  // 只取 optionSets：同一个缓存里还带着 access，不能把整个响应当 schema 用。
  useEffect(() => {
    if (schemaQ.data) {
      setDrafts(structuredClone(schemaQ.data.schema.optionSets ?? {}));
    }
  }, [schemaQ.data]);

  const saveMut = useMutation({
    mutationFn: ({ key, values }: { key: string; values: string[] }) =>
      api.setOptionSet(id, key, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: schemaKey(id) });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (user.role !== 'admin') {
    return <div className="empty-state">仅管理员可编辑选项集。</div>;
  }
  if (schemaQ.isError) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Icon name="alert-triangle" size={24} /></span>
        <span className="empty-title">无法读取选项集</span>
        <span>{(schemaQ.error as Error).message}</span>
        <Link to={`/tables/${id}`}>返回表格</Link>
      </div>
    );
  }
  if (!schemaQ.data) return <div className="muted">加载中...</div>;

  function updateDraft(key: string, values: string[]) {
    setDrafts((prev) => ({ ...prev, [key]: values }));
  }

  async function save(key: string) {
    setError(null);
    await saveMut.mutateAsync({ key, values: drafts[key] ?? [] });
  }

  function addSet() {
    if (!newKey.trim()) return;
    setDrafts((prev) => ({
      ...prev,
      [newKey]: newValues.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
    }));
    setNewKey('');
    setNewValues('');
  }

  return (
    <div>
      <div className="page-header">
        <h2>
          <Icon name="list" size={20} style={{ color: 'var(--primary-600)' }} />
          选项集
        </h2>
        <div className="subtitle">共 {Object.keys(drafts).length} 个选项集。</div>
      </div>

      <div className="toolbar" style={{ marginTop: -4 }}>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button className="ghost"><Icon name="chevron-left" size={14} /> 返回表格</button>
        </Link>
      </div>
      {error && <div className="error-msg"><Icon name="alert-triangle" size={14} /> {error}</div>}

      <div className="stagger">
      {(Object.entries(drafts)).map(([key, values]) => (
        <OptionSetEditor
          key={key}
          setKey={key}
          values={values}
          onChange={(next) => updateDraft(key, next)}
          onSave={() => save(key)}
          saving={saveMut.isPending && saveMut.variables?.key === key}
        />
      ))}

      <div className="option-set">
        <h3 style={{ margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={14} /> 新建选项集
        </h3>
        <div className="row">
          <div>
            <label>Key(英文/数字)</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="例如 priority_v1"
            />
          </div>
          <div style={{ flex: 2 }}>
            <label>初始值(逗号或换行分隔)</label>
            <input
              value={newValues}
              onChange={(e) => setNewValues(e.target.value)}
              placeholder="例如 高,中,低"
            />
          </div>
          <button className="primary" onClick={addSet} style={{ flex: '0 0 auto' }}>
            <Icon name="plus" size={14} /> 添加
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

function OptionSetEditor({
  setKey,
  values,
  onChange,
  onSave,
  saving,
}: {
  setKey: string;
  values: string[];
  onChange: (next: string[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [input, setInput] = useState('');

  return (
    <div className="option-set">
      <h3 style={{ margin: '4px 0 8px' }}>
        {setKey} <span className="muted">({values.length})</span>
      </h3>
      <div className="values">
        {values.map((v, idx) => (
          <span key={idx} className="chip" style={pillStyle(v)}>
            {v}
            <button
              onClick={() => {
                const next = values.slice();
                next.splice(idx, 1);
                onChange(next);
              }}
              title="删除"
              aria-label={`删除 ${v}`}
            >
              <Icon name="x" size={10} strokeWidth={3} />
            </button>
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12, marginBottom: 0 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="添加新值"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              onChange([...values, input.trim()]);
              setInput('');
            }
          }}
        />
        <button
          onClick={() => {
            if (input.trim()) {
              onChange([...values, input.trim()]);
              setInput('');
            }
          }}
          style={{ flex: '0 0 auto' }}
        >
          添加
        </button>
        <button
          className={saving ? 'primary loading' : 'primary'}
          onClick={onSave}
          disabled={saving}
          style={{ flex: '0 0 auto' }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}