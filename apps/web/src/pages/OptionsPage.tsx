import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export function OptionsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user)!;
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [newKey, setNewKey] = useState('');
  const [newValues, setNewValues] = useState('');
  const [error, setError] = useState<string | null>(null);

  const schemaQ = useQuery({
    queryKey: ['schema', id],
    queryFn: () => api.getTable(id).then((r) => r.schema),
  });

  useEffect(() => {
    if (schemaQ.data) {
      setDrafts(structuredClone(schemaQ.data.optionSets));
    }
  }, [schemaQ.data]);

  const saveMut = useMutation({
    mutationFn: ({ key, values }: { key: string; values: string[] }) =>
      api.setOptionSet(id, key, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schema', id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (user.role !== 'admin') {
    return <div className="empty-state">仅管理员可编辑选项集。</div>;
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
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>选项集</h2>
        <span className="muted">{Object.keys(drafts).length} 个</span>
        <span className="spacer" />
        <Link to={`/tables/${id}`}>
          <button>返回表格</button>
        </Link>
      </div>
      {error && <div className="error-msg">{error}</div>}

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
        <h3 style={{ margin: '4px 0 8px' }}>新建选项集</h3>
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
            添加
          </button>
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
          <span key={idx} className="chip">
            {v}
            <button
              onClick={() => {
                const next = values.slice();
                next.splice(idx, 1);
                onChange(next);
              }}
              title="删除"
            >
              ×
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
          className="primary"
          onClick={onSave}
          disabled={saving}
          style={{ flex: '0 0 auto' }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}