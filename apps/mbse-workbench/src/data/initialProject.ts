import { Project } from '../types';

export const initialProject: Project = {
  id: 'p1',
  name: '无人机系统架构项目 (UAV System)',
  elements: [
    { id: 'e1', name: '系统需求', type: 'Requirement', description: '无人机应具备自主避障能力' },
    { id: 'e2', name: '动力系统', type: 'Block', description: '提供飞行动力' },
    { id: 'e3', name: '飞控中心', type: 'Block', description: '核心控制单元' },
  ],
  relationships: [],
  diagrams: [
    { 
      id: 'd1', 
      name: '系统层级结构图 (BDD)', 
      type: 'BDD',
      nodes: [
        { 
          id: '1', 
          position: { x: 250, y: 50 }, 
          data: { 
            label: 'UAV System', 
            type: 'Package', 
            description: 'Main system package containing all subsystems and global constraints.',
            properties: { version: '1.0.0' },
            status: 'Verified',
            children: [{}, {}]
          }, 
          type: 'kerml' 
        },
        { 
          id: '2', 
          position: { x: 100, y: 200 }, 
          data: { 
            label: 'Power Subsystem', 
            type: 'Block', 
            description: 'Manages energy storage and distribution to all electronic components.',
            properties: { voltage: '24V', capacity: '5000mAh' },
            status: 'Review'
          }, 
          type: 'kerml' 
        },
        { 
          id: '3', 
          position: { x: 400, y: 200 }, 
          data: { 
            label: 'Control Subsystem', 
            type: 'Behavior', 
            description: 'Executes complex flight control algorithms and autonomous navigation logic.',
            properties: { frequency: '100Hz', latency: '<5ms' },
            status: 'Draft'
          }, 
          type: 'kerml' 
        },
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
        { id: 'e1-3', source: '1', target: '3', type: 'smoothstep' },
      ]
    }
  ]
};
