import type { UUID, SysMLMetatype, EdgeType } from './sysml-types.js';

/** Base event type */
export interface BaseEvent {
  type: string;
  timestamp: number;
}

/** Model change event */
export interface ModelChangeEvent extends BaseEvent {
  type: 'modelChange';
  elementId: UUID;
  changeKind: 'created' | 'updated' | 'deleted';
  metatype?: SysMLMetatype;
}

/** Document change event */
export interface DocumentChangeEvent extends BaseEvent {
  type: 'documentChange';
  uri: string;
  version: number;
}

/** Validation event */
export interface ValidationEvent extends BaseEvent {
  type: 'validation';
  uri: string;
  diagnosticCount: number;
  hasErrors: boolean;
}

/** All event types */
export type SystemEvent = ModelChangeEvent | DocumentChangeEvent | ValidationEvent;

/** Event handler function type */
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => void;

/** Event emitter interface */
export interface EventEmitter<T extends BaseEvent = BaseEvent> {
  on(handler: EventHandler<T>): void;
  off(handler: EventHandler<T>): void;
  emit(event: T): void;
}
