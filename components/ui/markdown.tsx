"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * MarkdownLite — a deliberately tiny safe markdown renderer.
 *
 * Supports the bits people actually use in bug threads:
 *  - **bold**, *italic*, ~~strike~~, `inline code`
 *  - ```fenced code blocks```
 *  - [text](https://link) (https only, opens new tab)
 *  - bare URLs auto-linked
 *  - @mentions  → <span data-mention="handle">
 *  - line breaks preserved
 *
 * Everything is rendered through React text nodes, never `dangerouslySetInnerHTML`
 * with user input, so XSS is structurally impossible.
 */

type Token =
  | { t: "text"; v: string }
  | { t: "bold"; v: Token[] }
  | { t: "italic"; v: Token[] }
  | { t: "strike"; v: Token[] }
  | { t: "code"; v: string }
  | { t: "codeblock"; v: string; lang?: string }
  | { t: "link"; href: string; v: Token[] }
  | { t: "mention"; handle: string }
  | { t: "br" };

const URL_RE = /\b(https?:\/\/[^\s<>"')]+)/g;
const MENTION_RE = /(^|[\s(])@([a-z0-9_.-]{2,32})/gi;

/**
 * Lets the surrounding chat row supply a `handle → display name` map so
 * mentions render as `@Name` instead of `@handle`. Falls back to the raw
 * handle when no name is known (keeps it copy-pasteable + server-resolvable).
 */
const MentionNamesContext = React.createContext<Record<string, string> | null>(null);

function parseInline(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const push = (tok: Token) => out.push(tok);

  while (i < src.length) {
    const rest = src.slice(i);

    // inline code
    const code = rest.match(/^`([^`\n]+)`/);
    if (code) {
      push({ t: "code", v: code[1] });
      i += code[0].length;
      continue;
    }

    // bold **
    const bold = rest.match(/^\*\*([^\n*][^\n]*?[^\n*]|\S)\*\*/);
    if (bold) {
      push({ t: "bold", v: parseInline(bold[1]) });
      i += bold[0].length;
      continue;
    }

    // italic *
    const italic = rest.match(/^\*([^\n*][^\n]*?[^\n*]|\S)\*/);
    if (italic) {
      push({ t: "italic", v: parseInline(italic[1]) });
      i += italic[0].length;
      continue;
    }

    // strikethrough ~~
    const strike = rest.match(/^~~([^\n~][^\n]*?[^\n~]|\S)~~/);
    if (strike) {
      push({ t: "strike", v: parseInline(strike[1]) });
      i += strike[0].length;
      continue;
    }

    // markdown link [text](url)
    const link = rest.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (link) {
      push({ t: "link", href: link[2], v: parseInline(link[1]) });
      i += link[0].length;
      continue;
    }

    // bare url
    const m = rest.match(/^https?:\/\/[^\s<>"')]+/);
    if (m) {
      push({ t: "link", href: m[0], v: [{ t: "text", v: m[0] }] });
      i += m[0].length;
      continue;
    }

    // mention
    const ment = rest.match(/^@([a-z0-9_.-]{2,32})/i);
    if (ment) {
      push({ t: "mention", handle: ment[1] });
      i += ment[0].length;
      continue;
    }

    // newline
    if (src[i] === "\n") {
      push({ t: "br" });
      i++;
      continue;
    }

    // plain char — accumulate until next special char
    let j = i;
    while (
      j < src.length &&
      !/[`*~\[\n@]/.test(src[j]) &&
      !src.slice(j).startsWith("http://") &&
      !src.slice(j).startsWith("https://")
    ) {
      j++;
    }
    if (j === i) {
      push({ t: "text", v: src[i] });
      i++;
    } else {
      push({ t: "text", v: src.slice(i, j) });
      i = j;
    }
  }

  return out;
}

function parseBlocks(src: string): Token[] {
  // pull out fenced code blocks first
  const out: Token[] = [];
  const re = /```(\w+)?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) {
      out.push(...parseInline(src.slice(last, m.index)));
    }
    out.push({ t: "codeblock", v: m[2], lang: m[1] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(...parseInline(src.slice(last)));
  return out;
}

function Render({ tokens }: { tokens: Token[] }): React.ReactElement {
  return (
    <>
      {tokens.map((tok, i) => {
        switch (tok.t) {
          case "text":
            return <span key={i}>{tok.v}</span>;
          case "br":
            return <br key={i} />;
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <Render tokens={tok.v} />
              </strong>
            );
          case "italic":
            return (
              <em key={i} className="italic">
                <Render tokens={tok.v} />
              </em>
            );
          case "strike":
            return (
              <s key={i} className="opacity-70">
                <Render tokens={tok.v} />
              </s>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded-md bg-muted/80 px-1.5 py-0.5 font-mono text-[0.85em]"
              >
                {tok.v}
              </code>
            );
          case "codeblock":
            return (
              <pre
                key={i}
                className="my-2 overflow-x-auto rounded-xl border border-border/60 bg-muted/60 p-3 text-[12px] leading-relaxed"
              >
                <code className="font-mono">{tok.v}</code>
              </pre>
            );
          case "link":
            return (
              <a
                key={i}
                href={tok.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                <Render tokens={tok.v} />
              </a>
            );
          case "mention":
            return <MentionChip key={i} handle={tok.handle} />;
        }
      })}
    </>
  );
}

function MentionChip({ handle }: { handle: string }) {
  const names = React.useContext(MentionNamesContext);
  const display = names?.[handle.toLowerCase()] ?? handle;
  return (
    <span
      data-mention={handle}
      title={`@${handle}`}
      className="rounded-md bg-primary/10 px-1 py-0.5 font-semibold text-primary"
    >
      @{display}
    </span>
  );
}

export function MarkdownLite({
  text,
  className,
  mentions,
}: {
  text: string;
  className?: string;
  /** Optional `handle → name` map so `@handle` renders as `@Name`. */
  mentions?: Array<{ handle: string; name: string }>;
}) {
  const tokens = React.useMemo(() => parseBlocks(text ?? ""), [text]);
  const names = React.useMemo(() => {
    if (!mentions?.length) return null;
    const m: Record<string, string> = {};
    for (const u of mentions) m[u.handle.toLowerCase()] = u.name;
    return m;
  }, [mentions]);
  return (
    <MentionNamesContext.Provider value={names}>
      <div
        className={cn(
          "whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90",
          className,
        )}
      >
        <Render tokens={tokens} />
      </div>
    </MentionNamesContext.Provider>
  );
}

/** Extract @handles client-side (mirror of server-side resolver). */
export function extractMentionHandles(text: string): string[] {
  const out = new Set<string>();
  text.replace(MENTION_RE, (_, _pre, h) => {
    out.add(h.toLowerCase());
    return _;
  });
  return Array.from(out);
}

/** Highlight URLs only (e.g. for descriptions that aren't markdown). */
export function linkify(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
