import { Fragment, type ReactNode } from "react";

interface MarkdownViewProps {
  content: string;
}

type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; text: string };

export function MarkdownView({ content }: MarkdownViewProps) {
  const blocks = parseMarkdown(content);

  return (
    <div className="markdown-view">
      {blocks.map((block, index) => (
        <Fragment key={`${block.type}-${index}`}>{renderBlock(block, index)}</Fragment>
      ))}
    </div>
  );
}

function parseMarkdown(content: string): Block[] {
  const lines = content.replace(/\r\n/g, "\n").trim().split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      blocks.push({ type: "code", text: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        level: Math.min(Math.max(heading[1].length, 2), 4) as 2 | 3 | 4,
        text: heading[2].trim()
      });
      index += 1;
      continue;
    }

    if (isUnorderedListItem(trimmed) || isOrderedListItem(trimmed)) {
      const ordered = isOrderedListItem(trimmed);
      const items: string[] = [];

      while (index < lines.length) {
        const itemLine = lines[index].trim();
        if (ordered ? !isOrderedListItem(itemLine) : !isUnorderedListItem(itemLine)) {
          break;
        }

        items.push(itemLine.replace(ordered ? /^\d+[.)]\s+/ : /^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }

      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    index += 1;

    while (index < lines.length && shouldContinueParagraph(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.type === "heading") {
    const Heading = `h${block.level}` as "h2" | "h3" | "h4";
    return <Heading>{renderInline(block.text, `h-${key}`)}</Heading>;
  }

  if (block.type === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List>
        {block.items.map((item, index) => (
          <li key={`${key}-${index}`}>{renderInline(item, `li-${key}-${index}`)}</li>
        ))}
      </List>
    );
  }

  if (block.type === "blockquote") {
    return <blockquote>{renderInline(block.text, `q-${key}`)}</blockquote>;
  }

  if (block.type === "code") {
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  }

  return <p>{renderInline(block.text, `p-${key}`)}</p>;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = tokenPattern.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${index}`;

    if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
    index += 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function shouldContinueParagraph(line: string): boolean {
  const trimmed = line.trim();

  return (
    Boolean(trimmed) &&
    !trimmed.startsWith("```") &&
    !trimmed.startsWith(">") &&
    !/^(#{1,4})\s+/.test(trimmed) &&
    !isUnorderedListItem(trimmed) &&
    !isOrderedListItem(trimmed)
  );
}

function isUnorderedListItem(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function isOrderedListItem(line: string): boolean {
  return /^\d+[.)]\s+/.test(line);
}
