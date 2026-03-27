import { useEffect, useMemo, useRef, useState } from 'react';
import { ForumMarkdown } from './ForumMarkdown';

type MarkdownEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  showPreview?: boolean;
};

type PendingSelection = { start: number; end: number };

function getLineRange(value: string, caret: number) {
  const start = value.lastIndexOf('\n', caret - 1) + 1;
  let end = value.indexOf('\n', caret);
  if (end === -1) end = value.length;
  return { start, end };
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  maxLength,
  disabled,
  showPreview = false,
}: MarkdownEditorProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<PendingSelection | null>(null);
  const [focused, setFocused] = useState(false);

  const remaining = useMemo(() => {
    if (maxLength == null) return null;
    return Math.max(0, maxLength - value.length);
  }, [maxLength, value.length]);

  useEffect(() => {
    if (!pendingSelection.current) return;
    const el = ref.current;
    if (!el) return;
    const { start, end } = pendingSelection.current;
    pendingSelection.current = null;
    el.focus();
    const startClamped = Math.max(0, Math.min(value.length, start));
    const endClamped = Math.max(0, Math.min(value.length, end));
    const s = Math.min(startClamped, endClamped);
    const e = Math.max(startClamped, endClamped);
    el.setSelectionRange(s, e);
  }, [value]);

  function setPendingSelection(next: PendingSelection) {
    pendingSelection.current = next;
  }

  function wrapSelection(open: string, close: string) {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + open + selected + close + value.slice(end);
    onChange(next);
    const newStart = start + open.length;
    const newEnd = newStart + selected.length;
    setPendingSelection({ start: newStart, end: newEnd });
  }

  function prefixLines(prefix: string) {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;

    const useStart = start === end ? getLineRange(value, start).start : start;
    const useEnd = start === end ? getLineRange(value, start).end : end;

    const segment = value.slice(useStart, useEnd);
    const lines = segment.split('\n');
    const prefixed = lines.map((l) => `${prefix}${l}`).join('\n');
    const next = value.slice(0, useStart) + prefixed + value.slice(useEnd);

    onChange(next);
    // Keep selection close to the original user selection.
    const delta = prefix.length * lines.length;
    const newStart = start === end ? useStart + prefix.length : start;
    const newEnd =
      start === end ? useStart + prefix.length + (end - start) : end + delta;
    setPendingSelection({ start: newStart, end: newEnd });
  }

  function prefixNumberedList() {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;

    const useStart = start === end ? getLineRange(value, start).start : start;
    const useEnd = start === end ? getLineRange(value, start).end : end;
    const segment = value.slice(useStart, useEnd);
    const lines = segment.split('\n');
    const prefixed = lines
      .map((l, i) => `${i + 1}. ${l}`)
      .join('\n');

    const next = value.slice(0, useStart) + prefixed + value.slice(useEnd);
    onChange(next);

    const delta = segment.length - segment.replace(/\n/g, '').length;
    const newStart = start === end ? useStart : start;
    const newEnd = start === end ? useStart + prefixed.length : end + delta;
    setPendingSelection({ start: newStart, end: newEnd });
  }

  const toolbarBtn =
    'text-xs px-2 py-1 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => wrapSelection('**', '**')}
          disabled={disabled}
          title="Bold (**text**)"
        >
          Bold
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => wrapSelection('*', '*')}
          disabled={disabled}
          title="Italic (*text*)"
        >
          Cursive
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => wrapSelection('~~', '~~')}
          disabled={disabled}
          title="Strikethrough (~~text~~)"
        >
          Sumups
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixLines('# ')}
          disabled={disabled}
          title="Header 1 (#)"
        >
          H1
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixLines('## ')}
          disabled={disabled}
          title="Header 2 (##)"
        >
          H2
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixLines('### ')}
          disabled={disabled}
          title="Header 3 (###)"
        >
          H3
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixLines('- ')}
          disabled={disabled}
          title="Bullets (- item)"
        >
          Bullets
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixNumberedList()}
          disabled={disabled}
          title="Numbered list"
        >
          1.,2.
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => prefixLines('> ')}
          disabled={disabled}
          title="Quote (> )"
        >
          Quote
        </button>
        <button
          type="button"
          className={toolbarBtn}
          onClick={() => wrapSelection('`', '`')}
          disabled={disabled}
          title="Inline code (`code`)"
        >
          Code
        </button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        className="w-full text-sm px-2 py-2 border border-gray-400 bg-white font-serif mb-2 disabled:opacity-70"
      />

      {maxLength != null ? (
        <div className="text-xs text-gray-600 mb-2" style={{ fontFamily: 'Arial, sans-serif' }}>
          {remaining} characters left
        </div>
      ) : null}

      {showPreview ? (
        <div
          className={`border border-gray-200 bg-gray-50 rounded-sm p-3 ${
            focused ? 'shadow-sm' : ''
          }`}
          style={{ fontFamily: 'Times New Roman, serif' }}
        >
          <ForumMarkdown text={value || ' '} />
        </div>
      ) : null}
    </div>
  );
}

