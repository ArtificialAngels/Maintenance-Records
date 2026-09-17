import { useRef, useState } from 'react';
import { api } from '../lib/api';
import type { CellValue, Column, ImageAssetRef } from '../lib/types';

interface Props {
  col: Column;
  rowId: string;
  tableId: string;
  value: CellValue | undefined;
  editable: boolean;
  optionSet?: string[];
  onChange: (next: CellValue | undefined) => void | Promise<void>;
  onPreviewImage: (url: string) => void;
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
  }
}

function TextCell({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (v: string | undefined) => void;
}) {
  const [v, setV] = useState(value);
  if (!editable) return <span>{value || <span className="placeholder">—</span>}</span>;
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onChange(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
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
  if (!editable) return <span>{value === '' ? '—' : String(value)}</span>;
  return (
    <input
      type="number"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v === '') {
          if (value !== '') onChange(undefined);
          return;
        }
        const n = Number(v);
        if (Number.isFinite(n) && n !== value) onChange(n);
      }}
    />
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
  if (!editable) return <span>{value || <span className="placeholder">—</span>}</span>;
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
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
  if (!editable) return <span>{value || <span className="placeholder">—</span>}</span>;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
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
  if (!editable) return <span>{value.join(', ') || '—'}</span>;
  return (
    <select
      multiple
      value={value}
      onChange={(e) => {
        const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
        onChange(opts);
      }}
      style={{ minHeight: 60 }}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
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
  onPreview: (url: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        {refs.map((r) => (
          <div key={r.assetId} style={{ position: 'relative' }}>
            <img
              className="thumb"
              src={api.imageUrl(tableId, rowId, colId, r.assetId)}
              alt={r.originalName}
              loading="lazy"
              onClick={() => onPreview(api.imageUrl(tableId, rowId, colId, r.assetId))}
              onError={(e) => {
                // Surface asset-load failures so the user sees something instead of a broken <img>.
                const img = e.currentTarget;
                img.style.border = '2px solid var(--danger)';
                img.style.background = '#fff5f5';
                img.title = '加载失败: ' + (r.originalName ?? '');
              }}
            />
            {editable && (
              <button
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  padding: 0,
                  borderRadius: '50%',
                  fontSize: 11,
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                }}
                onClick={() => remove(r.assetId)}
                title="删除图片"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && refs.length < maxCount && (
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            style={{ width: 48, height: 48, fontSize: 18 }}
            title="上传图片"
          >
            {uploading ? '...' : '+'}
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
      {error && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</div>}
    </div>
  );
}

function FormulaCell({ formula, value }: { formula: string; value: CellValue | undefined }) {
  const text = value == null ? '' : String(value);
  return (
    <span title={`公式: ${formula}`} style={{ color: 'var(--accent)' }}>
      {text || <span className="placeholder">—</span>}
    </span>
  );
}