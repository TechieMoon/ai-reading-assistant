import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownViewProps {
  content: string;
}

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
};

const markdownPlugins = [remarkGfm, remarkRecoverStrongText];

export function MarkdownView({ content }: MarkdownViewProps) {
  return (
    <div className="markdown-view">
      <ReactMarkdown remarkPlugins={markdownPlugins} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function remarkRecoverStrongText() {
  return (tree: MarkdownNode) => {
    visitParents(tree, (node, parent, index) => {
      if (!parent || index === undefined || node.type !== "text" || !node.value?.includes("**")) {
        return;
      }

      const recovered = splitStrongText(node.value);
      if (recovered.length > 1) {
        parent.children?.splice(index, 1, ...recovered);
      }
    });
  };
}

function splitStrongText(value: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  const pattern = /(?:\\\*\\\*|\*\*)(.+?)(?:\\\*\\\*|\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    nodes.push({
      type: "strong",
      children: [{ type: "text", value: match[1] }]
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes.length ? nodes : [{ type: "text", value }];
}

function visitParents(
  node: MarkdownNode,
  callback: (node: MarkdownNode, parent?: MarkdownNode, index?: number) => void,
  parent?: MarkdownNode,
  index?: number
) {
  callback(node, parent, index);

  const children = node.children;
  if (!children) {
    return;
  }

  for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
    visitParents(children[childIndex], callback, node, childIndex);
  }
}
