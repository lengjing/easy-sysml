import { BashTool } from '../tools/BashTool/BashTool.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { FileEditTool } from '../tools/FileEditTool/FileEditTool.js'
import { GlobTool } from '../tools/GlobTool/GlobTool.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { WebFetchTool } from '../tools/WebFetchTool/WebFetchTool.js'
import { TodoWriteTool } from '../tools/TodoWriteTool/TodoWriteTool.js'
import type { Tools } from '../Tool.js'

export const HEADLESS_TOOLS: Tools = [
  BashTool,
  FileReadTool,
  FileWriteTool,
  FileEditTool,
  GlobTool,
  GrepTool,
  WebFetchTool,
  TodoWriteTool,
]
