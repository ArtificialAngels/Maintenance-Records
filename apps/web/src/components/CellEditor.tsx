import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { pillStyle } from '../lib/colors';
import type { CellValue, Column, ImageAssetRef } from '../lib/types';
import { Icon } from './Icons';

interface Props {
  col: Column;
  rowId: string;
  tableId: string;
  value: CellValue | undefined;
  editable: boolean;
  optionSet?: string[];
  onChange: (next: CellValue | undefined) => void | Promise<void>;
  onPreviewImage: (url: string, all?: string[]) => void;
}

export function CellEditor(props: Props) {
  const { col, rowId, tableId, value, editable, optionSet, onChange, onPreviewImage } = props;

  switch (col.type) {
    case 'text':
      return (
        <TextCell value={(value as string) ?? ''} editable={editable} onChange={onChange} />
      );
    case 'number':
      return (
        <NumberCell
          value={(value as number) ?? ''}
          editable={editable}
          onChange={onChange}
        />
      );
    case 'date':
      return (
        <DateCell value={(value as string) ?? ''} editable={editable} onChange={onChange} />
      );
    case 'option': {
      const multiple = (col as Extract<Column, { type: 'option' }>).multiple;
      if (multiple) {
        return (
          <MultiOptionCell
            value={(value as string[]) ?? []}
            options={optionSet ?? []}
            editable={editable}
            onChange={onChange}
          />
        );
      }
      return (
        <SingleOptionCell
          value={(value as string) ?? ''}
          options={optionSet ?? []}
          editable={editable}
          onChange={onChange}
        />
      );
    }
    case 'image': {
      const multiple = (col as Extract<Column, { type: 'image' }>).multiple;
      const refs = value
        ? Array.isArray(value)
          ? (value as ImageAssetRef[])
          : [value as ImageAssetRef]
        : [];
      return (
        <ImageCell
          refs={refs}
          rowId={rowId}
          tableId={tableId}
          colId={col.id}
          editable={editable}
          multiple={multiple}
          maxCount={(col as Extract<Column, { type: 'image' }>).maxCount ?? 10}
          onChange={onChange}
          onPreview={onPreviewImage}
        />
      );
    }
    case 'formula':
      return <FormulaCell formula={col.formula} value={value} />;
    case 'autonumber':
      return <AutonumberCell value={value} />;
    default:
      return <span className="placeholder">—</span>;
  }
}

function AutonumberCell({ value }: { value: CellValue | undefined }) {
  if (value == null || value === '') return <span className="placeholder">—</span>;
  return (
    <span
      className="opt-pill-ghost mono"
      title="自动序号，由系统按行顺序生成"
      style={{ fontWeight: 600, color: 'var(--text-secondary)' }}
    >
      {String(value)}
    </span>
  );
}

/** Small spinner shown inside a cell while a save is in flight. */
function CellSpinner() {
  return (
    <span
      className="spinner"
      style={{ width: 11, height: 11, borderWidth: 2, position: 'absolute', right: 8, top: '50%', marginTop: -5.5 }}
    />
  );
}

function useCommit<T>(onChange: (v: T) => void | Promise<void>) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function commit(next: T) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onChange(next);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return { saving, commit };
}

function TextCell({
  value,
  editable,
  onChange,
  multiline,
}: {
  value: string;
  editable: boolean;
  onChange: (v: string | undefined) => void;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value);
  const { saving, commit } = useCommit(onChange);
  useEffect(() => setV(value), [value]);
  if (!editable) {
    return (
      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {value || <span className="placeholder">—</span>}
      </span>
    );
  }
  if (multiline) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <textarea
          value={v}
          rows={2}
          style={{ resize: 'vertical', minHeight: 32 }}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== value && commit(v)}
        />
        {saving && <CellSpinner />}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && commit(v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {saving && <CellSpinner />}
    </div>
  );
}

function NumberCell({
  value,
  editable,
  onChange,
}: {
  value: number | '';
  editable: boolean;
  onChange: (v: number | undefined) => void;
}) {
  const [v, setV] = useState<string>(value === '' ? '' : String(value));
  const { saving, commit } = useCommit(onChange);
  useEffect(() => setV(value === '' ? '' : String(value)), [value]);
  if (!editable) {
    return <span className="mono">{value === '' ? <span className="placeholder">—</span> : String(value)}</span>;
  }
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v === '') {
            if (value !== '') commit(undefined);
            return;
          }
          const n = Number(v);
          if (Number.isFinite(n) && n !== value) commit(n);
        }}
      />
      {saving && <CellSpinner />}
    </div>
  );
}

function DateCell({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (v: string | undefined) => void;
}) {
  const { saving, commit } = useCommit(onChange);
  if (!editable) {
    return <span>{value || <span className="placeholder">—</span>}</span>;
  }
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="date"
        value={value}
        onChange={(e) => commit(e.target.value || undefined)}
      />
      {saving && <CellSpinner />}
    </div>
  );
}

function OptionPills({ values }: { values: string[] }) {
  if (values.length === 0) return <span className="placeholder">—</span>;
  return (
    <div className="thumbs" style={{ gap: 4 }}>
      {values.map((v) => (
        <span key={v} className="opt-pill" style={pillStyle(v)}>
          {v}
        </span>
      ))}
    </div>
  );
}

function SingleOptionCell({
  value,
  options,
  editable,
  onChange,
}: {
  value: string;
  options: string[];
  editable: boolean;
  onChange: (v: string | undefined) => void;
}) {
  const { saving, commit } = useCommit(onChange);
  if (!editable) return <OptionPills values={value ? [value] : []} />;
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <select
        value={value}
        onChange={(e) => commit(e.target.value || undefined)}
        style={saving ? { paddingRight: 26 } : undefined}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {saving && <CellSpinner />}
    </div>
  );
}

function MultiOptionCell({
  value,
  options,
  editable,
  onChange,
}: {
  value: string[];
  options: string[];
  editable: boolean;
  onChange: (v: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const { saving, commit } = useCommit(onChange);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!editable) return <OptionPills values={value} />;

  function toggle(opt: string) {
    const next = value.includes(opt)
      ? value.filter((v) => v !== opt)
      : [...value, opt];
    commit(next);
  }

  return (
    <div className="multi-select" ref={ref}>
      <button
        type="button"
        className={`multi-select-trigger ${value.length ? 'has-value' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {value.length ? (
          <span className="multi-values">
            {value.map((v) => (
              <span key={v} className="opt-pill" style={pillStyle(v)}>
                {v}
              </span>
            ))}
          </span>
        ) : (
          <span className="placeholder">选择…</span>
        )}
        <Icon name="chevron-down" size={13} className="ms-caret" />
        {saving && <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />}
      </button>
      {open && (
        <div className="ms-menu popover">
          {options.length === 0 && <div className="ms-empty">暂无选项</div>}
          {options.map((opt) => {
            const checked = value.includes(opt);
            return (
              <button
                type="button"
                key={opt}
                className={`ms-item ${checked ? 'checked' : ''}`}
                onClick={() => toggle(opt)}
              >
                <span className="ms-check">
                  {checked && <Icon name="check" size={11} strokeWidth={3} />}
                </span>
                <span className="opt-pill" style={pillStyle(opt)}>
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ImageCell({
  refs,
  rowId,
  tableId,
  colId,
  editable,
  multiple,
  maxCount,
  onChange,
  onPreview,
}: {
  refs: ImageAssetRef[];
  rowId: string;
  tableId: string;
  colId: string;
  editable: boolean;
  multiple?: boolean;
  maxCount: number;
  onChange: (v: ImageAssetRef | ImageAssetRef[] | undefined) => void;
  onPreview: (url: string, all?: string[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = refs.map((r) => api.imageUrl(tableId, rowId, colId, r.assetId));

  async function onPick(file: File) {
    setError(null);
    setUploading(true);
    try {
      const r = await api.uploadImage(tableId, rowId, colId, file);
      const next = multiple ? [...refs, r.asset] : r.asset;
      await onChange(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function remove(assetId: string) {
    if (multiple) {
      onChange(refs.filter((r) => r.assetId !== assetId));
    } else {
      onChange(undefined);
    }
  }

  return (
    <div>
      <div className="thumbs">
        {refs.map((r, i) => {
          const url = urls[i]!;
          return (
            <div key={r.assetId} className="thumb-wrap">
              <img
                className="thumb"
                src={url}
                alt={r.originalName}
                loading="lazy"
                onClick={() => onPreview(url, multiple ? urls : undefined)}
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.border = '2px solid var(--danger)';
                  img.style.background = '#fff5f5';
                  img.title = '加载失败: ' + (r.originalName ?? '');
                }}
              />
              {editable && (
                <button
                  type="button"
                  className="thumb-remove"
                  onClick={() => remove(r.assetId)}
                  title="删除图片"
                  aria-label="删除图片"
                >
                  <Icon name="x" size={10} strokeWidth={3} />
                </button>
              )}
            </div>
          );
        })}
        {editable && refs.length < maxCount && (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className={uploading ? 'loading' : ''}
            title="上传图片"
            aria-label="上传图片"
          >
            {!uploading && <Icon name="plus" size={18} />}
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = '';
        }}
      />
      {error && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function FormulaCell({ formula, value }: { formula: string; value: CellValue | undefined }) {
  const text = value == null ? '' : String(value);
  return (
    <span
      title={`公式: ${formula}`}
      className="mono"
      style={{ color: 'var(--primary-700)', fontWeight: 600 }}
    >
      {text || <span className="placeholder">—</span>}
    </span>
  );
}
