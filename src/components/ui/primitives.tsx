'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LINES } from '@/data/lines';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

const LINE_STYLE = new Map(LINES.map((l) => [l.id, { bg: l.color, fg: l.textColor }]));

export function LineBadge({ line, size = 18, className }: { line: string; size?: number; className?: string }) {
  const st = LINE_STYLE.get(line as never) ?? { bg: '#64748b', fg: '#fff' };
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none', className)}
      style={{ width: size, height: size, background: st.bg, color: st.fg, fontSize: size * 0.55 }}
      title={`Ligne ${line}`}
      aria-label={`Ligne ${line}`}
    >
      {line}
    </span>
  );
}

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle' | 'success';

export function Button({
  variant = 'subtle',
  size = 'sm',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'xs' | 'sm' | 'md' }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent-strong text-white hover:bg-accent disabled:bg-panel-3 disabled:text-faint',
    ghost: 'text-muted hover:text-ink hover:bg-panel-3',
    danger: 'bg-red-600/90 text-white hover:bg-red-500',
    success: 'bg-emerald-600/90 text-white hover:bg-emerald-500',
    subtle: 'bg-panel-3 text-ink border border-edge-strong hover:border-accent/60 hover:bg-[#1c2c47]',
  };
  const sizes = { xs: 'h-6 px-2 text-[11px] gap-1', sm: 'h-7 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2' };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        styles[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('rounded-lg border border-edge bg-panel-2/80', className)}>
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {icon}
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={cx('p-3', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Petite infobulle explicative (au survol et au focus clavier). */
export function InfoTip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex" tabIndex={0} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-56 -translate-x-1/2 rounded-md border border-edge-strong bg-[#0b1322] px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug tracking-normal text-ink shadow-xl group-hover:block group-focus:block"
      >
        {text}
      </span>
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5 text-xs text-ink/90">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-4 w-7 rounded-full transition-colors', checked ? 'bg-accent-strong' : 'bg-panel-3 border border-edge-strong')}
      >
        <span className={cx('absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all', checked ? 'left-3.5' : 'left-0.5')} />
      </button>
    </label>
  );
}

/** Curseur + champ numérique synchronisés (validation à la saisie). */
export function SliderField({
  value,
  min,
  max,
  step = 1,
  onCommit,
  unit,
  label,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  unit?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) {
      setLocal(value);
      setDraft(String(value));
    }
  }, [value]);
  const commit = (v: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(v / step) * step));
    setLocal(clamped);
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-8 shrink-0 text-[11px] text-muted">{label}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        aria-label={label ?? 'valeur'}
        className="min-w-0 flex-1"
        onChange={(e) => {
          editing.current = true;
          setLocal(Number(e.target.value));
          setDraft(e.target.value);
        }}
        onPointerUp={() => {
          editing.current = false;
          commit(local);
        }}
        onKeyUp={() => {
          editing.current = false;
          commit(local);
        }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label={`${label ?? 'valeur'} (saisie)`}
        className="tabular w-14 text-right"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = Number(draft.replace(',', '.'));
          if (Number.isFinite(v)) commit(v);
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {unit && <span className="w-8 shrink-0 text-[10px] text-faint">{unit}</span>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('max-h-[90vh] w-full overflow-hidden rounded-xl border border-edge-strong bg-panel shadow-2xl', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-panel-3 hover:text-ink" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>
        <div className="panel-scroll max-h-[calc(90vh-52px)] p-4">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'sm',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <div className="inline-flex rounded-md border border-edge-strong bg-panel-3 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded px-2 font-medium transition-colors',
            size === 'xs' ? 'h-5 text-[10px]' : 'h-6 text-[11px]',
            o.value === value ? 'bg-accent-strong text-white' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-md">
      <div className="space-y-4 text-sm text-ink/90">
        <div>{message}</div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
