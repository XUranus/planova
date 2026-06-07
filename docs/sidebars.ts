import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/configuration',
      ],
    },
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'user-guide/dashboard',
        'user-guide/upload',
        'user-guide/viewer',
        'user-guide/inspector',
        'user-guide/styles',
        'user-guide/export',
      ],
    },
    {
      type: 'category',
      label: 'Pipeline',
      items: [
        'pipeline/overview',
        'pipeline/preprocessing',
        'pipeline/vlm-parsing',
        'pipeline/wall-detection',
        'pipeline/plan-graph',
        'pipeline/normalization',
        'pipeline/repair',
        'pipeline/validation',
        'pipeline/furniture',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/data-model',
        'architecture/frontend',
        'architecture/engine',
        'architecture/backend',
      ],
    },
    {
      type: 'category',
      label: 'Development',
      items: [
        'development/setup',
        'development/testing',
        'development/contributing',
        'development/changelog',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'api/commands',
        'api/types',
      ],
    },
  ],
};

export default sidebars;
