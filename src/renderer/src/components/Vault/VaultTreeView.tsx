import { useState } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';

interface VaultTreeNode {
  name: string;
  type: 'folder' | 'file';
  relativePath: string;
  children?: VaultTreeNode[];
}

interface VaultTreeViewProps {
  tree: VaultTreeNode[];
  onSelectNote: (relativePath: string) => void;
}

export function VaultTreeView({ tree, onSelectNote }: VaultTreeViewProps) {
  if (tree.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-gray-400">
        Vault vide
      </div>
    );
  }

  return (
    <div className="p-1">
      {tree.map((node) => (
        <TreeNode key={node.relativePath} node={node} depth={0} onSelectNote={onSelectNote} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  onSelectNote,
}: {
  node: VaultTreeNode;
  depth: number;
  onSelectNote: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.type === 'folder') {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 w-full px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-gray-400 shrink-0" />
          )}
          <Folder size={12} className="text-yellow-500 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.relativePath}
                node={child}
                depth={depth + 1}
                onSelectNote={onSelectNote}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectNote(node.relativePath)}
      className="flex items-center gap-1 w-full px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-xs"
      style={{ paddingLeft: `${depth * 12 + 4 + 16}px` }}
    >
      <FileText size={12} className="text-purple-400 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
