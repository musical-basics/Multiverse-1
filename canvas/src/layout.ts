import dagre from '@dagrejs/dagre';
import type { Node, Edge } from 'reactflow';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 90;

interface MultiverseNode {
  node_id: string;
  git_hash: string;
  parent_id: string;
  intent_prompt: string;
  timestamp: string;
  worktree_path: string;
  status: string;
}

/**
 * Convert backend MultiverseNode array → React Flow nodes + edges,
 * laid out horizontally with dagre.
 */
export function buildGraphElements(
  nodes: MultiverseNode[]
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 120 });

  // Add nodes to dagre
  nodes.forEach((n) => {
    dagreGraph.setNode(n.node_id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre
  const edges: Edge[] = [];
  nodes.forEach((n) => {
    if (n.parent_id) {
      dagreGraph.setEdge(n.parent_id, n.node_id);
      edges.push({
        id: `${n.parent_id}->${n.node_id}`,
        source: n.parent_id,
        target: n.node_id,
        style: { stroke: '#4ade80', strokeWidth: 2 },
        animated: true,
      });
    }
  });

  dagre.layout(dagreGraph);

  const rfNodes: Node[] = nodes.map((n) => {
    const pos = dagreGraph.node(n.node_id);
    return {
      id: n.node_id,
      type: 'commitNode',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: {
        label: n.intent_prompt,
        intent: n.intent_prompt,
        hash: n.git_hash,
        status: (n.status as 'active' | 'inactive' | 'conflicted') ?? 'inactive',
        timestamp: n.timestamp,
      },
    };
  });

  return { nodes: rfNodes, edges };
}
