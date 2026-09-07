import { useState, useMemo, useCallback } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Dice5, Lock, Unlock, ChevronDown, ChevronRight } from 'lucide-react';
import type { ParamSchema, MediaInput } from '@shared/types';
import { Input, Textarea } from './Input';
import { DropZone } from './DropZone';

interface SchemaFormProps {
  params: Record<string, ParamSchema>;
  values: Record<string, unknown>;
  onChange(values: Record<string, unknown>): void;
  mediaInputs?: Record<string, MediaInput>;
  onMediaInput?(field: string, input: MediaInput): void;
}

export function SchemaForm({ params, values, onChange, mediaInputs, onMediaInput }: SchemaFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [seedLocked, setSeedLocked] = useState(false);

  const setValue = useCallback(
    (key: string, val: unknown) => {
      onChange({ ...values, [key]: val });
    },
    [values, onChange],
  );

  const { standard, advanced } = useMemo(() => {
    const std: [string, ParamSchema][] = [];
    const adv: [string, ParamSchema][] = [];
    for (const [key, schema] of Object.entries(params)) {
      if (schema.advanced) adv.push([key, schema]);
      else std.push([key, schema]);
    }
    return { standard: std, advanced: adv };
  }, [params]);

  function shouldShow(schema: ParamSchema): boolean {
    if (!schema.showWhen) return true;
    return values[schema.showWhen.field] === schema.showWhen.value;
  }

  function renderField(key: string, schema: ParamSchema) {
    if (!shouldShow(schema)) return null;

    const value = values[key] ?? schema.default ?? '';

    return (
      <div key={key} className="flex flex-col gap-1.5">
        <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
          {schema.label}
          {schema.required && <span className="text-[var(--color-danger)]">*</span>}
          {schema.unit && <span className="text-[var(--color-text-muted)] font-normal">({schema.unit})</span>}
        </label>

        {schema.help && (
          <p className="text-[var(--text-xs)] text-[var(--color-text-muted)]">{schema.help}</p>
        )}

        {renderControl(key, schema, value)}
      </div>
    );
  }

  function renderControl(key: string, schema: ParamSchema, value: unknown) {
    if (schema.type === 'string' && schema.multiline) {
      return (
        <Textarea
          value={value as string}
          onChange={(e) => setValue(key, e.target.value)}
          placeholder={schema.placeholder}
          rows={3}
        />
      );
    }

    if (schema.type === 'string' && (schema.enum || schema.options)) {
      const opts = schema.options ?? schema.enum!.map((v) => ({ value: v, label: v }));
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue(key, opt.value)}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                value === opt.value
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    }

    if (schema.type === 'string') {
      return (
        <div className="relative">
          <Input
            type="text"
            value={value as string}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={schema.placeholder}
          />
          {key === 'prompt' && typeof value === 'string' && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-xs)] text-[var(--color-text-muted)]">
              {(value as string).length}
            </span>
          )}
        </div>
      );
    }

    if ((schema.type === 'number' || schema.type === 'integer') && schema.min !== undefined && schema.max !== undefined) {
      const numVal = typeof value === 'number' ? value : Number(value) || schema.min;
      const isSeed = key === 'seed';

      return (
        <div className="flex items-center gap-3">
          <SliderPrimitive.Root
            className="relative flex items-center select-none touch-none w-full h-5"
            value={[numVal]}
            onValueChange={([v]) => setValue(key, schema.type === 'integer' ? Math.round(v) : v)}
            min={schema.min}
            max={schema.max}
            step={schema.step ?? (schema.type === 'integer' ? 1 : 0.01)}
          >
            <SliderPrimitive.Track className="bg-[var(--color-bg-tertiary)] relative grow rounded-full h-1.5">
              <SliderPrimitive.Range className="absolute bg-[var(--color-accent)] rounded-full h-full" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb className="block w-4 h-4 bg-[var(--color-accent)] rounded-full shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-hover)] transition-colors focus:outline-none focus:shadow-[var(--focus-ring)]" />
          </SliderPrimitive.Root>
          <input
            type="number"
            className="w-20 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-sm)] text-[var(--color-text)] text-right font-[var(--font-mono)] tabular-nums"
            value={numVal}
            onChange={(e) => {
              const n = schema.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
              if (!isNaN(n)) setValue(key, Math.min(Math.max(n, schema.min!), schema.max!));
            }}
            min={schema.min}
            max={schema.max}
            step={schema.step}
          />
          {isSeed && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSeedLocked(!seedLocked)}
                className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
                title={seedLocked ? 'Unlock seed' : 'Lock seed'}
              >
                {seedLocked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setValue(key, Math.floor(Math.random() * (schema.max! - schema.min!)) + schema.min!)}
                className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]"
                title="Random seed"
              >
                <Dice5 size={14} />
              </button>
            </div>
          )}
        </div>
      );
    }

    if (schema.type === 'number' || schema.type === 'integer') {
      return (
        <Input
          type="number"
          value={value as number}
          onChange={(e) => {
            const n = schema.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value);
            if (!isNaN(n)) setValue(key, n);
          }}
          min={schema.min}
          max={schema.max}
          step={schema.step}
        />
      );
    }

    if (schema.type === 'boolean') {
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => setValue(key, e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-accent)]"
          />
          <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            {schema.label}
          </span>
        </label>
      );
    }

    if (schema.type === 'enum') {
      const opts = schema.options ?? schema.enum!.map((v) => ({ value: v, label: v }));
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setValue(key, opt.value)}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                value === opt.value
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      );
    }

    if (schema.type === 'image' || schema.type === 'mask' || schema.type === 'video') {
      const existing = mediaInputs?.[key];
      return (
        <div>
          {existing ? (
            <div className="flex items-center gap-2 p-2 bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)]">
              <span className="text-[var(--text-sm)] truncate flex-1">{existing.name ?? 'file'}</span>
              <button
                type="button"
                onClick={() => onMediaInput?.(key, { blob: new Blob() })}
                className="text-[var(--text-xs)] text-[var(--color-danger)] hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <DropZone
              accept={schema.accept ?? (schema.type === 'video' ? 'video/*' : 'image/*')}
              onDrop={(input) => onMediaInput?.(key, input)}
              compact
              label={`Drop ${schema.type} file`}
            />
          )}
        </div>
      );
    }

    if (schema.type === 'images') {
      return (
        <DropZone
          accept={schema.accept ?? 'image/*'}
          onDrop={(input) => onMediaInput?.(key, input)}
          compact
          label={`Drop image (max ${schema.maxItems ?? 'unlimited'})`}
        />
      );
    }

    return <Input type="text" value={String(value)} onChange={(e) => setValue(key, e.target.value)} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {standard.map(([key, schema]) => renderField(key, schema))}

      {advanced.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1.5 text-[var(--text-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Advanced ({advanced.length})
          </button>
          {advancedOpen && (
            <div className="flex flex-col gap-4 mt-3 pl-2 border-l-2 border-[var(--color-border-subtle)]">
              {advanced.map(([key, schema]) => renderField(key, schema))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
