import { Project } from '../types';

export const initialProject: Project = {
  id: 'p1',
  name: '新建项目',
  elements: [],
  relationships: [],
  diagrams: [
    {
      id: 'd1',
      name: '主图',
      type: 'BDD',
      nodes: [],
      edges: [],
    }
  ]
};
