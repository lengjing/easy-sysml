/**
 * SysML Monaco Editor Component
 *
 * A React wrapper around Monaco Editor configured for SysML/KerML editing.
 * Registers the SysML language on first mount and wires up language service
 * providers (diagnostics, hover, completion, go-to-definition).
 */
import React, { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { registerSysMLLanguage, SYSML_LANGUAGE_ID } from './sysml-language';
import { registerSysMLProviders, scheduleDiagnostics } from './sysml-language-service';

export interface SysMLEditorProps {
  /** Current editor value. */
  value: string;
  /** Called whenever the content changes. */
  onChange: (value: string) => void;
  /** Optional CSS class for the container div. */
  className?: string;
}

/** Whether language providers have already been registered globally. */
let _providersRegistered = false;

export const SysMLEditor: React.FC<SysMLEditorProps> = ({
  value,
  onChange,
  className,
}) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  /** Register the SysML language before Monaco mounts. */
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    registerSysMLLanguage(monaco);
    if (!_providersRegistered) {
      registerSysMLProviders(monaco);
      _providersRegistered = true;
    }
    monacoRef.current = monaco;
  }, []);

  /** Store the editor instance and run initial diagnostics. */
  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Run diagnostics on the initial content
    const model = editor.getModel();
    if (model) {
      scheduleDiagnostics(monaco, model, 100);
    }

    editor.focus();
  }, []);

  /** Propagate content changes and schedule diagnostics. */
  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? '');

      // Schedule diagnostics when content changes
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (editor && monaco) {
        const model = editor.getModel();
        if (model) {
          scheduleDiagnostics(monaco, model);
        }
      }
    },
    [onChange],
  );

  /** Observe theme changes (dark ↔ light). */
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const monaco = monacoRef.current;
      if (monaco) {
        const dark = document.documentElement.classList.contains('dark');
        monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      <Editor
        language={SYSML_LANGUAGE_ID}
        value={value}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        theme={isDark ? 'vs-dark' : 'vs'}
        options={{
          minimap: { enabled: true },
          fontSize: 12,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          wordWrap: 'on',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          suggestOnTriggerCharacters: true,
          folding: true,
          glyphMargin: true,
          padding: { top: 8, bottom: 8 },
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  );
};
