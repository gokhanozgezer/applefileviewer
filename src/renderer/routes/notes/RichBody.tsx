import type { ReactNode } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { NoteRun } from '@shared/domain';

interface Props {
  body: string;
  runs: NoteRun[];
}

/** Satır içi biçimli metin parçası (newline içermez). */
interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  styleType: number | null;
  checklistDone: boolean | null;
}

/** Görsel satır: span listesi + satırın paragraf stili. */
interface Line {
  spans: Span[];
  styleType: number | null;
  checklistDone: boolean | null;
}

function plainSpan(text: string): Span {
  return {
    text,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    styleType: null,
    checklistDone: null,
  };
}

/**
 * Run'ları span listesine çevirir. Run'lar 0'dan bitişik beklenir;
 * herhangi bir tutarsızlıkta (sınır dışı, boşluk, negatif uzunluk)
 * kalan metin düz olarak eklenir — asla crash etmez.
 */
function buildSpans(body: string, runs: NoteRun[]): Span[] {
  const spans: Span[] = [];
  let pos = 0;
  for (const run of runs) {
    if (run.start === pos && run.length === 0) continue;
    if (run.start !== pos || run.length < 0 || run.start + run.length > body.length) break;
    spans.push({
      text: body.slice(run.start, run.start + run.length),
      bold: run.bold,
      italic: run.italic,
      underline: run.underline,
      strikethrough: run.strikethrough,
      styleType: run.styleType,
      checklistDone: run.checklistDone,
    });
    pos = run.start + run.length;
  }
  if (pos < body.length) spans.push(plainSpan(body.slice(pos)));
  return spans;
}

/** Span'ları \n sınırlarında bölerek satırlara dağıtır. */
function splitIntoLines(spans: Span[]): Line[] {
  const lines: Line[] = [];
  let current: Span[] = [];
  const flush = () => {
    const styled = current.find((s) => s.styleType !== null);
    lines.push({
      spans: current,
      styleType: styled ? styled.styleType : null,
      checklistDone: styled ? styled.checklistDone : null,
    });
    current = [];
  };
  for (const span of spans) {
    const parts = span.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) flush();
      if (part.length > 0) current.push({ ...span, text: part });
    });
  }
  flush();
  // pre-wrap davranışıyla eşleş: sondaki \n fazladan boş satır üretmesin.
  const last = lines[lines.length - 1];
  if (lines.length > 1 && last && last.spans.length === 0) lines.pop();
  return lines;
}

function inlineClass(span: Span): string {
  const classes: string[] = [];
  if (span.bold) classes.push('font-semibold');
  if (span.italic) classes.push('italic');
  if (span.underline) classes.push('underline');
  if (span.strikethrough) classes.push('line-through');
  return classes.join(' ');
}

function renderSpans(spans: Span[]): ReactNode {
  if (spans.length === 0) return '\u00A0'; // bos satir yuksekligini koru
  return spans.map((span, i) => {
    const cls = inlineClass(span);
    return cls ? (
      <span key={i} className={cls}>
        {span.text}
      </span>
    ) : (
      <span key={i}>{span.text}</span>
    );
  });
}

function ListLine({ prefix, children }: { prefix: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 select-none tabular-nums">{prefix}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap">{children}</span>
    </div>
  );
}

function ChecklistLine({ done, children }: { done: boolean; children: ReactNode }) {
  const Icon = done ? CheckSquare : Square;
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.5} />
      <span
        className={
          done
            ? 'min-w-0 flex-1 whitespace-pre-wrap text-text-muted line-through'
            : 'min-w-0 flex-1 whitespace-pre-wrap'
        }
      >
        {children}
      </span>
    </div>
  );
}

function renderLine(line: Line, key: number, listNumber: number): ReactNode {
  const content = renderSpans(line.spans);
  switch (line.styleType) {
    case 0:
      return (
        <div key={key} className="whitespace-pre-wrap text-lg font-semibold">
          {content}
        </div>
      );
    case 1:
      return (
        <div key={key} className="whitespace-pre-wrap text-base font-semibold">
          {content}
        </div>
      );
    case 2:
      return (
        <div key={key} className="whitespace-pre-wrap text-sm font-semibold">
          {content}
        </div>
      );
    case 4:
      return (
        <div key={key} className="whitespace-pre-wrap font-mono text-sm">
          {content}
        </div>
      );
    case 100:
      return (
        <ListLine key={key} prefix="•">
          {content}
        </ListLine>
      );
    case 101:
      return (
        <ListLine key={key} prefix="–">
          {content}
        </ListLine>
      );
    case 102:
      return (
        <ListLine key={key} prefix={`${listNumber}.`}>
          {content}
        </ListLine>
      );
    case 103:
      return (
        <ChecklistLine key={key} done={line.checklistDone === true}>
          {content}
        </ChecklistLine>
      );
    default:
      return (
        <div key={key} className="whitespace-pre-wrap">
          {content}
        </div>
      );
  }
}

/**
 * Not gövdesini NoteRun aralıklarına göre zengin biçimde çizer.
 * runs boşsa (veya bir hata olursa) bugünkü düz metin görünümüne düşer.
 */
export function RichBody({ body, runs }: Props) {
  const plain = <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{body}</p>;
  if (runs.length === 0) return plain;

  try {
    const lines = splitIntoLines(buildSpans(body, runs));
    let listNumber = 0;
    const rendered = lines.map((line, i) => {
      listNumber = line.styleType === 102 ? listNumber + 1 : 0;
      return renderLine(line, i, listNumber);
    });
    return <div className="text-sm leading-relaxed text-text">{rendered}</div>;
  } catch {
    return plain;
  }
}
