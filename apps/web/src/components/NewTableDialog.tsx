import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  FIELD_TYPE_LABEL,
  NEW_TABLE_TEMPLATE,
  buildNewTableSchema,
  slugifyTableId,
} from '../lib/tableTemplates';
import { Icon } from './Icons';
import { toast } from './Toaster';

/** Create a table from the built-in maintenance template. Admin-only (the
 * backend enforces the same rule). */
export function NewTableDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [fallbackId] = useState(() => `tbl_${Math.random().toString(36).slice(2, 10)}`);
  const [selected, setSelected] = useState<string[]>(() =>
    NEW_TABLE_TEMPLATE.map((t) => t.key),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Auto-derive the id from the name until the user edits it by hand.
  useEffect(() => {
    if (!idTouched) setId(slugifyTableId(name) || fallbackId);
  }, [name, idTouched, fallbackId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allSelected = selected.length === NEW_TABLE_TEMPLATE.length;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function toggleAll() {
    setSelected(allSelected ? [] : NEW_TABLE_TEMPLATE.map((t) => t.key));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError('请填写表名');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
      setError('表 ID 需以字母或数字开头，只能包含字母、数字、下划线和连字符');
      return;
    }
    if (selected.length === 0) {
      setError('请至少选择一个模板列');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.createTable(
        buildNewTableSchema({ id, name, templateKeys: selected }),
      );
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success(`已创建表格「${r.schema.name}」`);
      onClose();
      navigate(`/tables/${r.schema.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="um-dialog nt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="新建表格"
      >
        <div className="um-dialog-head">
          <span className="um-dialog-icon" aria-hidden>
            <Icon name="layers" size={17} />
          </span>
          <div>
            <div className="um-dialog-title">新建表格</div>
            <div className="um-dialog-sub">
              默认带上维修记录常用列，创建后可随时在「列配置」中调整
            </div>
          </div>
          <button
            className="ghost icon-btn um-close"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
            disabled={saving}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <form className="um-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="error-msg um-error" role="alert">
              <Icon name="alert-triangle" size={14} /> {error}
            </div>
          )}

          <label className="um-field">
            <span className="um-label">表名</span>
            <span className="um-input-wrap">
              <Icon name="columns-3" size={14} className="um-input-icon" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如 设备维修记录"
                autoFocus
                disabled={saving}
              />
            </span>
          </label>

          <label className="um-field">
            <span className="um-label">
              表 ID <span className="nt-hint">（用于网址，可自定义）</span>
            </span>
            <span className="um-input-wrap">
              <Icon name="tag" size={14} className="um-input-icon" />
              <input
                className="mono"
                value={id}
                onChange={(e) => {
                  setIdTouched(true);
                  setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''));
                }}
                placeholder="例如 equipment_records"
                disabled={saving}
              />
            </span>
          </label>

          <div className="um-field">
            <span className="um-label nt-template-label">
              模板列
              <button
                type="button"
                className="text-btn"
                onClick={toggleAll}
                disabled={saving}
              >
                {allSelected ? '全不选' : '全选'}
              </button>
            </span>
            <div className="nt-template">
              {NEW_TABLE_TEMPLATE.map((t) => (
                <label key={t.key} className="nt-template-item">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(t.key)}
                    onChange={() => toggle(t.key)}
                    disabled={saving}
                  />
                  <span className="nt-template-name">
                    {t.column.name}
                    {t.column.required && (
                      <span className="nt-required" title="必填">
                        *
                      </span>
                    )}
                  </span>
                  <span className="nt-template-meta">
                    {FIELD_TYPE_LABEL[t.column.type] ?? t.column.type}
                    <span className="nt-dot">·</span>
                    {t.hint}
                  </span>
                </label>
              ))}
            </div>
            <span className="nt-hint">
              已选择 {selected.length} / {NEW_TABLE_TEMPLATE.length} 列
            </span>
          </div>

          <div className="um-actions">
            <button
              type="button"
              className="ghost um-btn"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className="um-btn primary"
              disabled={saving}
              data-testid="create-table-submit"
            >
              {saving ? (
                <>
                  <span className="spinner" /> 创建中...
                </>
              ) : (
                <>
                  <Icon name="plus" size={14} /> 创建表格
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
