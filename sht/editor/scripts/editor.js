// editor.js
// Модуль для инициализации редактора, автокомплита и работы с DOM
// Глобальные функции для использования в index.html и других js-файлах

// -----------------------------
// CodeMirror 6 compatibility shim for CM5 API
// -----------------------------
import {EditorState, EditorSelection, Compartment, StateEffect, StateField} from "https://esm.sh/@codemirror/state@6";
import {EditorView, keymap, drawSelection, lineNumbers, Decoration} from "https://esm.sh/@codemirror/view@6";
import {history, historyKeymap, defaultKeymap} from "https://esm.sh/@codemirror/commands@6";
import {defaultHighlightStyle, syntaxHighlighting, foldGutter, HighlightStyle} from "https://esm.sh/@codemirror/language@6";
import {json} from "https://esm.sh/@codemirror/lang-json@6";
import {autocompletion, startCompletion, closeCompletion, completionKeymap} from "https://esm.sh/@codemirror/autocomplete@6";
import {searchKeymap, openSearchPanel} from "https://esm.sh/@codemirror/search@6";
import {tags} from "https://esm.sh/@lezer/highlight@1";
import { buildSuggestions, getCurrentJsonPath, getHintsForPathImproved, customJsonHint as customJsonHintImpl } from './hints.js';

(function initCM6Shim(){
  if (window.__cm6ShimInitialized) return;
  window.__cm6ShimInitialized = true;

  function lineChToOffset(view, pos){
    const line = view.state.doc.line((pos.line|0) + 1);
    return Math.max(line.from, Math.min(line.to, line.from + (pos.ch|0)));
  }
  function offsetToLineCh(view, offset){
    const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, offsetToLine(view, offset))));
    const lineObj = view.state.doc.lineAt(offset);
    return { line: lineObj.number - 1, ch: offset - lineObj.from };
  }
  function offsetToLine(view, offset){
    try { return view.state.doc.lineAt(offset).number; } catch { return 1; }
  }

  // Shared store for CM5 hint helpers
  let registeredJsonHintHelper = null;

  function createCompletionSource(adapter){
    return (context)=>{
      if (!registeredJsonHintHelper) return null;

      const view = adapter.view;
      // CM5-like shim object passed into helper
      const cmShim = {
        getCursor(){
          const head = view.state.selection.main.head;
          const line = view.state.doc.lineAt(head);
          return { line: line.number - 1, ch: head - line.from };
        },
        getLine(n){ return view.state.doc.line((n|0) + 1).text; },
        getValue(){ return view.state.doc.toString(); },
        getTokenAt(pos){
          try {
            const lineObj = view.state.doc.line((pos.line|0) + 1);
            const lineText = lineObj.text;
            const ch = Math.max(0, Math.min(lineText.length, pos.ch|0));
            // Detect inside string by scanning for unescaped quotes
            let inString = false, start = 0, i = 0;
            while (i < ch){
              const c = lineText[i];
              if (c === '"' && lineText[i-1] !== '\\') inString = !inString, start = i;
              i++;
            }
            if (inString){
              // Find end quote to compute token end
              let j = ch; let end = lineText.length;
              while (j < lineText.length){
                if (lineText[j] === '"' && lineText[j-1] !== '\\'){ end = j+1; break; }
                j++;
              }
              const str = lineText.slice(start, Math.max(end, ch));
              const before = lineText.slice(0, ch);
              const hasColon = /:\s*$.*/.test(before) || before.includes(':');
              return { string: str, type: 'string', start, end: Math.max(end, ch), state: { lastType: hasColon ? 'colon' : null } };
            }
            // Not in string: best-effort word token
            const before = lineText.slice(0, ch);
            const after = lineText.slice(ch);
            const m1 = before.match(/[\w$"']+$/);
            const m2 = after.match(/^[\w$"']*/);
            const s = m1 ? ch - m1[0].length : ch;
            const e = m2 ? ch + m2[0].length : ch;
            const tok = lineText.slice(s, e) || '';
            const hasColon = /:\s*$/.test(before);
            return { string: tok, type: null, start: s, end: e, state: { lastType: hasColon ? 'colon' : null } };
          } catch {
            return { string: '', type: null, start: pos.ch|0, end: pos.ch|0, state: {} };
          }
        },
        replaceSelection(text){
          const tr = view.state.replaceSelection(text);
          view.dispatch(tr);
        },
        replaceRange(text, from, to){
          const insert = String(text || '');
          const f = lineChToOffset(view, from);
          const t = to ? lineChToOffset(view, to) : f;
          const anchor = f + insert.length;
          view.dispatch({ changes: { from: f, to: t, insert }, selection: { anchor } });
        },
        setCursor(pos){
          const at = lineChToOffset(view, pos);
          view.dispatch({ selection: { anchor: at } });
          view.focus();
        },
        getSelection(){
          const r = view.state.selection.main;
          return view.state.sliceDoc(r.from, r.to);
        },
        execCommand(cmd){
          if (cmd === 'autocomplete') startCompletion(view);
          if (cmd === 'closeCompletion') closeCompletion(view);
        }
      };

      // Build hints via extracted hints module
      let res = null;
      try { res = customJsonHintImpl(cmShim); } catch {}
      if (!res || !Array.isArray(res.list)) {
        try {
          let path = getCurrentJsonPath(cmShim) || [];
          // Попробовать использовать карту пути курсора, если она богаче
          try {
            if (Array.isArray(window.currentJsonCursorPath)) {
              const mapPath = window.currentJsonCursorPath.map(p => p && p.key).filter(k => typeof k === 'string');
              const hasKnown = (arr)=>Array.isArray(arr) && arr.some(k=>k==='services' || k==='characteristics' || k==='link' || k==='options');
              if (!path.length || (hasKnown(mapPath) && (!hasKnown(path) || mapPath.length > path.length))) {
                path = mapPath;
              }
            }
          } catch {}
          const schemaNode = getHintsForPathImproved(path, window.schemaHintsTree);
          const built = buildSuggestions(cmShim, schemaNode, path, window.schema);
          res = { list: built.list, from: { line: cmShim.getCursor().line, ch: built.fromCh }, to: { line: cmShim.getCursor().line, ch: built.toCh } };
        } catch {}
      }
      if (!res || !Array.isArray(res.list)) return null;

      // Compute from/to offsets
      const fromPos = res.from && typeof res.from.line === 'number' ? lineChToOffset(view, res.from) : context.pos;
      const toPos = res.to && typeof res.to.line === 'number' ? lineChToOffset(view, res.to) : context.pos;

      return {
        from: fromPos,
        to: toPos,
        options: res.list.map(item => ({
          label: String(item.displayText || item.text || ''),
          apply(v, completion, from, to){
            if (typeof item.hint === 'function') {
              try { item.hint(cmShim, null, item); closeCompletion(v); return; } catch {}
            }
            const insert = String(item.text || item.displayText || '');
            v.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
          }
        })),
        // Enable filtering and interaction behavior similar to CM5
        filter: true,
        update(current){ return current; }
      };
    };
  }

  function buildKeymap(options){
    const extra = [];
    // Basic mappings used in the app
    extra.push({ key: 'Mod-f', run: openSearchPanel });
    // Fallback: map replace to open the search panel (CM6 no direct openReplacePanel export)
    extra.push({ key: 'Mod-r', run: openSearchPanel });
    extra.push({ key: 'Ctrl-Space', run: (v)=>{ startCompletion(v); return true; } });

    // Map provided extraKeys if any
    if (options && options.extraKeys){
      const map = options.extraKeys;
      const bind = (key, cmd)=>{ if (!map[key]) return; extra.push({ key, run: (v)=>{ if (cmd==='find') return openSearchPanel(v); if (cmd==='replace') return openSearchPanel(v); if (cmd==='undo') return history.undo(v) || true; if (cmd==='redo') return history.redo(v) || true; if (cmd==='autocomplete'){ startCompletion(v); return true; } return false; } }); };
      bind('Ctrl-F','find'); bind('Cmd-F','find');
      bind('Ctrl-R','replace'); bind('Cmd-R','replace');
      bind('Ctrl-Z','undo'); bind('Cmd-Z','undo');
      bind('Ctrl-Y','redo'); bind('Cmd-Y','redo');
      bind('Ctrl-Space','autocomplete');
    }
    return extra;
  }

  // Highlight styles for light/dark
  // Unified hues (same hue per token, lighter on dark, darker on light)
  const hues = {
    property: { light: '#b05e36', dark: '#f78c6c' },
    string:   { light: '#b58900', dark: '#ffd866' },
    number:   { light: '#1a5fb4', dark: '#9cdcfe' },
    boolNull: { light: '#6f42c1', dark: '#c792ea' },
    punct:    { light: '#333333', dark: '#cccccc' }
  };
  const lightHighlight = HighlightStyle.define([
    { tag: tags.propertyName, color: hues.property.light },
    { tag: [tags.string], color: hues.string.light },
    { tag: [tags.number], color: hues.number.light },
    { tag: [tags.bool, tags.null], color: hues.boolNull.light },
    { tag: [tags.bracket, tags.punctuation, tags.operator], color: hues.punct.light }
  ]);
  const darkHighlight = HighlightStyle.define([
    { tag: tags.propertyName, color: hues.property.dark },
    { tag: [tags.string], color: hues.string.dark },
    { tag: [tags.number], color: hues.number.dark },
    { tag: [tags.bool, tags.null], color: hues.boolNull.dark },
    { tag: [tags.bracket, tags.punctuation, tags.operator], color: hues.punct.dark }
  ]);
  const highlightCompartment = new Compartment();

  function createAdapter(mountEl, options){
    const changeHandlers = [];
    const keydownHandlers = [];
    const keyupHandlers = [];
    const cursorHandlers = [];
    const focusHandlers = [];

    // CM6 decoration-based error line highlighter to survive re-rendering
    const addErrorMark = StateEffect.define();
    const clearErrorMarks = StateEffect.define();
    const errorMark = Decoration.line({ class: 'error-line' });
    const errorMarksField = StateField.define({
      create() { return Decoration.none; },
      update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) {
          if (e.is(clearErrorMarks)) deco = Decoration.none;
          if (e.is(addErrorMark)) deco = deco.update({ add: [errorMark.range(e.value)] });
        }
        return deco;
      },
      provide: f => EditorView.decorations.from(f)
    });

    const baseExtensions = [
      history(),
      drawSelection(),
      json(),
      highlightCompartment.of(syntaxHighlighting(lightHighlight)),
      lineNumbers(),
      foldGutter(),
      autocompletion({
        override: [ (ctx)=> adapter && registeredJsonHintHelper ? adapter._completionSource(ctx) : null ],
        activateOnTyping: false
      }),
      keymap.of([ ...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, ...buildKeymap(options) ]),
      errorMarksField,
      EditorView.updateListener.of((update)=>{
        if (update.docChanged){ changeHandlers.forEach(fn=>{ try{ fn(); }catch{} }); }
        if (update.selectionSet){ cursorHandlers.forEach(fn=>{ try{ fn(); }catch{} }); }
        if (update.focusChanged && update.view.hasFocus){ focusHandlers.forEach(fn=>{ try{ fn(); }catch{} }); }
      })
    ];

    const initialDoc = '';
    const state = EditorState.create({ doc: initialDoc, extensions: baseExtensions });
    const view = new EditorView({ state, parent: mountEl });

    const adapter = {
      view,
      _completionSource: null,
      on(event, handler){
        if (event === 'change') changeHandlers.push(handler);
        if (event === 'keydown') { keydownHandlers.push(handler); }
        if (event === 'keyup') { keyupHandlers.push(handler); }
        if (event === 'cursorActivity') { cursorHandlers.push(handler); }
        if (event === 'focus') { focusHandlers.push(handler); }
      },
      getValue(){ return view.state.doc.toString(); },
      setValue(text){ view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(text||'') } }); },
      refresh(){ /* no-op in CM6 */ },
      getCursor(){ const head = view.state.selection.main.head; const ln = view.state.doc.lineAt(head); return { line: ln.number - 1, ch: head - ln.from }; },
      setCursor(pos){ const at = lineChToOffset(view, pos); view.dispatch({ selection: { anchor: at } }); view.focus(); },
      focus(){ view.focus(); },
      getLine(n){ return view.state.doc.line((n|0)+1).text; },
      lineCount(){ return view.state.doc.lines; },
      getScrollInfo(){ return { left: view.scrollDOM.scrollLeft, top: view.scrollDOM.scrollTop }; },
      scrollTo(left=0, top=0){ try { view.scrollDOM.scrollTo(left, top); } catch { view.scrollDOM.scrollLeft=left; view.scrollDOM.scrollTop=top; } },
      execCommand(name){
        if (name==='autocomplete') return startCompletion(view);
        if (name==='closeCompletion') return closeCompletion(view);
        if (name==='find') return openSearchPanel(view);
        if (name==='replace') return openSearchPanel(view);
        if (name==='selectAll'){ view.dispatch({ selection: EditorSelection.range(0, view.state.doc.length) }); return true; }
      },
      undo(){ history.undo(view); },
      redo(){ history.redo(view); },
      replaceSelection(text){ const tr = view.state.replaceSelection(String(text||'')); view.dispatch(tr); },
      replaceRange(text, from, to){ const f = lineChToOffset(view, from); const t = to ? lineChToOffset(view, to) : f; view.dispatch({ changes: { from: f, to: t, insert: String(text||'') } }); },
      getSelection(){ const r = view.state.selection.main; return view.state.sliceDoc(r.from, r.to); },
      setOption(/*key, value*/){ /* best-effort no-op to keep API */ },
      getWrapperElement(){ return view.dom; },
      setTheme(theme){
        try {
          const style = (String(theme||'light') === 'dark') ? darkHighlight : lightHighlight;
          view.dispatch({ effects: highlightCompartment.reconfigure(syntaxHighlighting(style)) });
        } catch {}
      },
      addKeyMap(map){
        view.dom.addEventListener('keydown', (e)=>{
          const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
          const mod = isMac ? e.metaKey : e.ctrlKey;
          const key = e.key.toUpperCase();
          const combo = (mod? 'Mod-' : (e.ctrlKey?'Ctrl-':'')) + key;
          const tryRun = (name)=>{ if (typeof map[name] === 'function'){ e.preventDefault(); try{ map[name](adapter); }catch{} return true; } };
          if ((e.ctrlKey && key==='S') && tryRun('Ctrl-S')) return;
          if ((e.metaKey && key==='S') && tryRun('Cmd-S')) return;
        });
      },
      addLineClass(line, /*where*/_w, className){
        try {
          if (className !== 'error-line') return;
          const ln = Math.max(0, Math.min(view.state.doc.lines - 1, (line|0)));
          const pos = view.state.doc.line(ln + 1).from;
          view.dispatch({ effects: addErrorMark.of(pos) });
        } catch {}
      },
      removeLineClass(line, /*where*/_w, className){
        try {
          if (className !== 'error-line') return;
          // Simplest approach: clear all error marks (they will be re-added as needed)
          view.dispatch({ effects: clearErrorMarks.of(null) });
        } catch {}
      },
      scrollIntoView(pos, yMargin){
        try {
          const off = (typeof pos === 'number') ? pos : lineChToOffset(view, pos);
          const rect = view.coordsAtPos(off);
          if (rect){
            const top = Math.max(0, rect.top + view.scrollDOM.scrollTop - (typeof yMargin==='number'? yMargin : 100));
            view.scrollDOM.scrollTo({ top, behavior: 'smooth' });
          } else {
            view.scrollDOM.scrollTo({ top: 0 });
          }
        } catch {}
      }
    };

      // Wire key events for legacy listeners
    view.dom.addEventListener('keydown', (e)=>{ keydownHandlers.forEach(fn=>{ try{ fn(adapter, e); }catch{} }); }, true);
    view.dom.addEventListener('keyup', (e)=>{ keyupHandlers.forEach(fn=>{ try{ fn(adapter, e); }catch{} }); }, true);

    // Bind completion source bound to this adapter
    adapter._completionSource = createCompletionSource(adapter);

    return adapter;
  }

  // Expose minimal CM5-like global
  window.CodeMirror = {
    Pos: (line, ch)=>({ line, ch }),
    fromTextArea: function(el, options){
      let mount = el;
      if (el && el.tagName && el.tagName.toLowerCase() === 'textarea'){
        const container = document.createElement('div');
        el.parentNode.insertBefore(container, el);
        el.style.display = 'none';
        mount = container;
      }
      const adapter = createAdapter(mount, options||{});
      // Initialize with existing textarea value if provided
      if (el && el.tagName && el.tagName.toLowerCase() === 'textarea'){
        adapter.setValue(el.value || '');
      }
      // Apply current theme highlight once initialized
      try {
        const currentTheme = (localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
        if (typeof adapter.setTheme === 'function') adapter.setTheme(currentTheme);
      } catch {}
      return adapter;
    },
    registerHelper: function(type, name, func){
      if (type === 'hint') registeredJsonHintHelper = func;
    }
  };
})();

// Register custom JSON hint provider using the new hints module
try { CodeMirror.registerHelper('hint', 'json', (cm) => customJsonHintImpl(cm)); } catch (_) {}

window.addEventListener('DOMContentLoaded', function () {
    // --- Инициализация CodeMirror ---
    window.editor = CodeMirror.fromTextArea(document.getElementById('jsonEditor'), {
        mode: 'application/json',
        lineNumbers: true,
        indentUnit: 2,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        // Убираем Infinity, оставляем разумное значение для производительности
        viewportMargin: 30,
        extraKeys: {
            'Ctrl-F': 'find',
            'Cmd-F': 'find',
            'Ctrl-R': 'replace',
            'Cmd-R': 'replace',
            'Ctrl-Z': 'undo',
            'Cmd-Z': 'undo',
            'Ctrl-Y': 'redo',
            'Cmd-Y': 'redo',
            'Ctrl-C': 'copy',
            'Cmd-C': 'copy',
            'Ctrl-V': 'paste',
            'Cmd-V': 'paste',
            'Ctrl-A': 'selectAll',
            'Cmd-A': 'selectAll',
            'Ctrl-Space': 'autocomplete',
            'Escape': function (cm) {
                // Закрываем автокомплит
                cm.execCommand('closeCompletion');
            }
        },
        historyEventDelay: 500,
        showHint: true,
        hintOptions: {
            completeSingle: false,
            alignWithWord: true
        }
    });

    // Восстановление значения из localStorage
    const savedJson = localStorage.getItem('jsonEditorValue');
    if (savedJson !== null) {
        window.editor.setValue(savedJson);
        window.editor.refresh();
    }

    // Восстановление позиции курсора и скролла после перезагрузки
    (function restoreCursorAndScroll() {
        try {
            const posRaw = localStorage.getItem('jsonEditorCursorPos');
            const scrollRaw = localStorage.getItem('jsonEditorScroll');
            if (!posRaw && !scrollRaw) return;
            const lineCount = window.editor.lineCount();
            let targetPos = null;
            if (posRaw) {
                const pos = JSON.parse(posRaw);
                const safeLine = Math.max(0, Math.min(lineCount - 1, pos.line || 0));
                const lineLen = (window.editor.getLine(safeLine) || '').length;
                const safeCh = Math.max(0, Math.min(lineLen, pos.ch || 0));
                targetPos = { line: safeLine, ch: safeCh };
            }
            const apply = () => {
                if (targetPos) {
                    window.__suppressCursorPathUpdate = true;
                    window.editor.setCursor(targetPos);
                    window.editor.focus();
                    setTimeout(() => {
                        window.__suppressCursorPathUpdate = false;
                        try {
                            window.lastCursorPosition = targetPos;
                            if (typeof window.getCurrentJsonPath === 'function') {
                                window.lastCursorPath = window.getCurrentJsonPath(window.editor);
                            }
                        } catch(_) {}
                        updateCursorPathMap();
                        if (typeof window.updateToolbarButtonsVisibility === 'function') {
                            window.updateToolbarButtonsVisibility();
                        }
                    }, 0);
                }
                if (scrollRaw) {
                    const s = JSON.parse(scrollRaw);
                    if (s && (typeof s.left === 'number' || typeof s.top === 'number')) {
                        window.editor.scrollTo(s.left || 0, s.top || 0);
                    }
                }
            };
            // Небольшая задержка, чтобы CodeMirror успел отрисоваться
            setTimeout(apply, 0);
        } catch (_) {}
    })();

    // Сохранять значение при каждом изменении
    window.editor.on('change', function () {
        localStorage.setItem('jsonEditorValue', window.editor.getValue());
    });

    // Сохранять позицию курсора и скролл
    const persistCursorAndScroll = window.debounce(function() {
        try {
            const cur = window.editor.getCursor();
            localStorage.setItem('jsonEditorCursorPos', JSON.stringify(cur));
            const s = window.editor.getScrollInfo();
            localStorage.setItem('jsonEditorScroll', JSON.stringify({ left: s.left, top: s.top }));
        } catch (_) {}
    }, 150);

    // Автоматический запуск автокомплита при вводе определенных символов
    window.editor.on('keyup', function (cm, event) {
        // Игнорируем навигационные клавиши
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight' ||
            event.key === 'Escape' || event.key === 'Tab' ||
            event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') {
            return;
        }

        // Если курсор в конце строки и только что ввели запятую/закрывающую кавычку/скобку — закрываем подсказки и не открываем заново
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line);
        const beforeCursor = line.slice(0, cur.ch);
        const afterCursor = line.slice(cur.ch);
        const atEOL = /^\s*$/.test(afterCursor);
        if (atEOL && (/(,|\}|\]|")\s*$/.test(beforeCursor) || event.key === ',' || event.key === '}' || event.key === ']' || event.key === '"')) {
            cm.execCommand('closeCompletion');
            window.autocompleteJustClosed = true;
            return;
        }

        // Проверяем, что автокомплит не был только что закрыт
        if (window.autocompleteJustClosed) {
            window.autocompleteJustClosed = false;
            return;
        }

        // Запускаем автокомплит только при вводе определенных символов
        if (event.key && /[a-zA-Z0-9_$]/.test(event.key)) {
            const cur = cm.getCursor();
            const line = cm.getLine(cur.line);
            const beforeCursor = line.slice(0, cur.ch);

                    // Не запускаем автокомплит если:
        // 1. Курсор в конце строки после запятой
        // 2. Курсор в конце строки после открывающей скобки
        // 3. Курсор в конце строки после двоеточия
        if (!/(,\s*)$/.test(beforeCursor) && !/^\s*[,{\[\s]*$/.test(beforeCursor)) {
            setTimeout(() => {
                cm.execCommand('autocomplete');
            }, 100);
        }
        }

        // Также запускаем автокомплит при вводе кавычек и двоеточия
        if (event.key === '"' || event.key === ':') {
            const cur = cm.getCursor();
            const line = cm.getLine(cur.line);
            const beforeCursor = line.slice(0, cur.ch);

            if (!/(,\s*)$/.test(beforeCursor) && !/^\s*[,{\[\s]*$/.test(beforeCursor)) {
                setTimeout(() => {
                    cm.execCommand('autocomplete');
                }, 100);
            }
        }
    });

    // Обработка закрытия автокомплита и показ подсказок по Enter
    window.editor.on('keydown', function (cm, event) {
        if (event.key === 'Escape') {
            window.autocompleteJustClosed = true;
        }

        // Показываем подсказки по Enter
        if (event.key === 'Enter') {
            const cur = cm.getCursor();
            const line = cm.getLine(cur.line);
            const beforeCursor = line.slice(0, cur.ch);

            // Если курсор не в конце строки после запятой/скобки, показываем подсказки
            if (!/^\s*[,{\[\s]*$/.test(beforeCursor)) {
                setTimeout(() => {
                    cm.execCommand('autocomplete');
                }, 50);
            }
        }
    });

    // --- Схема аксессуара и автокомплит ---
    window.schema = {};
    window.allowedInputTypesFromSchema = [];
    window.schemaHintsTree = null;
    window.autocompleteJustClosed = false;

    // --- Сохранение позиции курсора ---
    window.lastCursorPosition = null;
    window.lastCursorPath = null;

    window.buildSchemaHintsTree = function (schema) {
        function walk(def, path = []) {
            let result = {};
            if (def.properties) {
                for (const key in def.properties) {
                    const prop = def.properties[key];

                    // Создаем объект для поля
                    const fieldObj = {
                        type: prop.type,
                        description: prop.description || '',
                        enum: prop.enum || null
                    };

                    // Если это объект с вложенными свойствами
                    if (prop.properties) {
                        fieldObj.properties = walk(prop, path.concat(key));
                    }

                    // Разрешаем прямые ссылки $ref на определения (не только внутри items)
                    if (!fieldObj.properties && prop.$ref) {
                        const refName = prop.$ref.replace('#/$defs/', '');
                        if (schema.$defs && schema.$defs[refName]) {
                            fieldObj.properties = walk(schema.$defs[refName], path.concat(key));
                        }
                    }

                    // Если это массив с items, то добавляем свойства items
                    if (prop.type === 'array' && prop.items) {
                        if (prop.items.properties) {
                            fieldObj.properties = walk(prop.items, path.concat(key));
                        } else if (prop.items.$ref) {
                            // Обрабатываем ссылки на определения
                            const refName = prop.items.$ref.replace('#/$defs/', '');
                            if (schema.$defs && schema.$defs[refName]) {
                                fieldObj.properties = walk(schema.$defs[refName], path.concat(key));
                            }
                        }
                    }

                    // Если есть $ref, то добавляем свойства из определения
                    if (prop.$ref) {
                        const refName = prop.$ref.replace('#/$defs/', '');
                        if (schema.$defs && schema.$defs[refName]) {
                            fieldObj.properties = walk(schema.$defs[refName], path.concat(key));
                        }
                    }

                    // Проект-специфичная нормализация: services/characteristics/link
                    if (!fieldObj.properties && key === 'services' && schema.properties && schema.properties.services && schema.properties.services.items) {
                        fieldObj.properties = walk(schema.properties.services.items, path.concat(key));
                    }
                    if (!fieldObj.properties && key === 'characteristics' && schema.$defs && schema.$defs.characteristic) {
                        fieldObj.properties = walk(schema.$defs.characteristic, path.concat(key));
                    }
                    if (!fieldObj.properties && key === 'link' && schema.$defs && schema.$defs.link) {
                        fieldObj.properties = walk(schema.$defs.link, path.concat(key));
                    }

                    result[key] = fieldObj;
                }
            }
            return result;
        }

        // Создаем дерево подсказок из основных свойств схемы
        let result = {};
        if (schema.properties) {
            result = walk(schema);
        }

        // Явное описание структур: оборачиваем в поле с properties, чтобы форма была единообразной
        if (schema && schema.properties && schema.properties.services && schema.properties.services.items) {
            result.services = { type: 'array', properties: walk(schema.properties.services.items) };
        }
        if (schema && schema.$defs && schema.$defs.characteristic) {
            result.characteristics = { type: 'array', properties: walk(schema.$defs.characteristic) };
        }

        return result;
    };

    window.loadSchema = function (schemaFile) {
        fetch(schemaFile)
            .then(response => response.json())
            .then(data => {
                window.schema = data;
                window.schemaHintsTree = window.buildSchemaHintsTree(data);

                // --- Заполнение allowedInputTypesFromSchema ---
                let inputTypeEnum = [];
                if (
                    data.$defs &&
                    data.$defs.characteristic &&
                    data.$defs.characteristic.properties &&
                    data.$defs.characteristic.properties.inputType &&
                    Array.isArray(data.$defs.characteristic.properties.inputType.enum)
                ) {
                    inputTypeEnum = data.$defs.characteristic.properties.inputType.enum;
                }
                window.allowedInputTypesFromSchema = inputTypeEnum;

                // Важная диагностическая информация
                if (!window.schemaHintsTree) {
                    console.error('Ошибка: Дерево подсказок не создано');
                }
                // Сообщаем частям UI (мастер и др.), что схема загружена – можно перерисоваться
                try { document.dispatchEvent(new CustomEvent('schemaLoaded')); } catch(e) {}
            })
            .catch(error => {
                console.error('Ошибка загрузки схемы:', error);
                document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка загрузки схемы ${schemaFile}: ${error.message}</li></ul>`;
            });
    };
    window.loadSchema('accessory.json');

    // --- Работа с темами ---
    // Перенесено в utils.js

    // --- Загрузка sh_types.json ---
    window.shTypes = [];
    fetch('./sh_types.json')
        .then(response => response.json())
        .then(data => window.shTypes = data.result?.service?.types?.types || [])
        .catch(error => {
            console.error('Ошибка загрузки sh_types.json:', error);
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка загрузки sh_types.json: ${error.message}</li></ul>`;
        });

    // --- Выбор шаблона ---
    window.oneClickFixMode = false;
    window.selectedTemplateCallback = null;
    window.controllerLinkFields = null;
    fetch('controller_link_fields.json')
        .then(response => response.json())
        .then(data => window.controllerLinkFields = data)
        .catch(() => window.controllerLinkFields = null);

    function setControllerSelect(type) {
        const select = document.getElementById('controllerSelect');
        if (select && type && select.value !== type) {
            select.value = type;
            const event = new Event('change', { bubbles: true });
            select.dispatchEvent(event);
        }
    }

    // === АВТОДЕТЕКТ КОНТРОЛЛЕРА ПОСЛЕ ОПРЕДЕЛЕНИЯ ВСЕХ ФУНКЦИЙ ===
    window.selectTemplateWithDropdown = function (json, callback) {
        let templates = [];
        if (Array.isArray(json)) {
            templates = json;
        } else if (
            json && typeof json === 'object' &&
            Object.keys(json).length > 0 &&
            Object.keys(json).every(k => /^\d+$/.test(k))
        ) {
            templates = Object.values(json);
        } else {
            callback(json);
            return;
        }
        if (templates.length <= 1) {
            callback(templates[0]);
            return;
        }
        // Новый модальный диалог выбора шаблона без поиска
        window.showModalSelectDialog({
            title: 'Файл содержит несколько шаблонов. Выберите один:',
            items: templates,
            renderItem: (item, idx) => {
                return `<div class='modal-select-item-title'>${item.name || ''}</div><div class='modal-select-item-sub'>${item.manufacturer || 'без производителя'} / ${item.model || 'без модели'}</div>`;
            },
            onSelect: (item, idx) => {
                callback(item);
                if (window.oneClickFixMode) {
                    window.oneClickFixMode = false;
                    setTimeout(() => window.oneClickFixRun(), 100);
                }
            },
            enableSearch: false
        });
    };

    // === АВТОДЕТЕКТ КОНТРОЛЛЕРА ===
    const origSelectTemplateWithDropdown = window.selectTemplateWithDropdown;
    window.selectTemplateWithDropdown = function (json, callback) {
        origSelectTemplateWithDropdown(json, function (selectedIndexOrObj) {
            let template = selectedIndexOrObj;
            if (typeof selectedIndexOrObj === 'number') {
                let templates = Array.isArray(json) ? json : Object.values(json);
                template = templates[selectedIndexOrObj];
            }
            if (window.controllerLinkFields) {
                const detected = window.detectControllerType(template, window.controllerLinkFields);
                setControllerSelect(detected);
            }
            callback(selectedIndexOrObj);
        });
    };

    // --- Открытие файла ---
    document.getElementById('uploadFile').addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    let fileContent = e.target.result;
                    fileContent = fileContent.replace(/^\uFEFF/, '');
                    let parsed = JSON.parse(fileContent);
                    document.getElementById('errorOutput').textContent = '';
                    document.getElementById('correctionOutput').textContent = '';
                    document.getElementById('autoFixContainer').innerHTML = '';
                    window.selectTemplateWithDropdown(parsed, (selectedTemplate) => {
                        window.editor.setValue(JSON.stringify(selectedTemplate, null, 2));
                        window.editor.refresh();
                    });
                } catch (err) {
                    document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка чтения файла: ${err.message}</li></ul>`;
                }
            };
            reader.readAsText(file);
        }
        // Очищаем значение input, чтобы событие срабатывало при повторном выборе того же файла
        event.target.value = '';
    });

    // --- Drag & Drop ---
    window.initDragAndDrop();

    // --- Тема ---
    if (typeof window.initTheme === 'function') {
        window.initTheme();
    }

    // --- Контекстное меню ---
    if (typeof window.initContextMenu === 'function') {
        window.initContextMenu();
    }

    // --- Инициализация панели инструментов ---
    window.initEditorToolbar();

    // --- Мобильный long-press для контекстного меню ---
    (function enableLongPressContextMenu(){
        if (!window.editor) return;
        const el = window.editor.getWrapperElement();
        let pressTimer = null;
        let startX = 0, startY = 0;
        const threshold = 550; // мс удержания
        const moveTolerance = 10; // px

        const clearTimer = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
        const onTouchStart = (e) => {
            try {
                const t = e.touches && e.touches[0] ? e.touches[0] : null;
                if (!t) return;
                startX = t.clientX; startY = t.clientY;
                clearTimer();
                pressTimer = setTimeout(() => {
                    try {
                        if (typeof window.updateContextMenuVisibility === 'function') window.updateContextMenuVisibility();
                        if (typeof window.showContextMenu === 'function') window.showContextMenu(startX, startY, e);
                        // Накрываем overlay, чтобы закрыть по тапу
                        const overlay = document.createElement('div');
                        overlay.className = 'cm-hold-gesture-overlay';
                        overlay.addEventListener('touchend', ()=>{ try { if (typeof window.hideContextMenu === 'function') window.hideContextMenu(); } catch(_){} overlay.remove(); }, { passive: true });
                        document.body.appendChild(overlay);
                    } catch(_) {}
                }, threshold);
            } catch(_) {}
        };
        const onTouchMove = (e) => {
            const t = e.touches && e.touches[0] ? e.touches[0] : null;
            if (!t) return;
            const dx = Math.abs(t.clientX - startX);
            const dy = Math.abs(t.clientY - startY);
            if (dx > moveTolerance || dy > moveTolerance) clearTimer();
        };
        const onTouchEnd = () => clearTimer();
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    })();

    // --- Сохранение позиции курсора при изменениях + кликабельные крошки пути ---
    function updateCursorPathMap() {
        const mapDiv = document.getElementById('cursorPathMap');
        if (!mapDiv) return;
        let value = window.editor.getValue();
        let cursor = window.lastCursorPosition;
        if (!cursor) {
            mapDiv.textContent = 'root';
            window.currentJsonCursorPath = [];
            return;
        }
        let lines = value.split('\n');
        let cursorLine = cursor.line;
        let json;
        try {
            json = JSON.parse(value);
        } catch (e) {
            mapDiv.textContent = 'root';
            window.currentJsonCursorPath = [];
            return;
        }

        function findPath(node, lineStart, lineEnd, path = [], typePath = []) {
            if (Array.isArray(node)) {
                let idx = 0;
                let curLine = lineStart + 1;
                for (const item of node) {
                    let itemStr = JSON.stringify(item, null, 2);
                    let itemLines = itemStr.split('\n').length;
                    let itemLineStart = curLine;
                    let itemLineEnd = curLine + itemLines - 1;
                    if (cursorLine >= itemLineStart && cursorLine <= itemLineEnd) {
                        let sub = findPath(item, itemLineStart, itemLineEnd, path.concat(idx), typePath.concat([{ key: idx, type: getType(item) }]));
                        return sub.length ? sub : typePath.concat([{ key: idx, type: getType(item) }]);
                    }
                    curLine = itemLineEnd + 1;
                    idx++;
                }
            } else if (typeof node === 'object' && node !== null) {
                let keys = Object.keys(node);
                for (const key of keys) {
                    let value = node[key];
                    let keyLine = -1;
                    for (let i = lineStart; i <= lineEnd; i++) {
                        if (lines[i] && lines[i].includes('"' + key + '"')) {
                            keyLine = i;
                            break;
                        }
                    }
                    if (keyLine !== -1) {
                        if (Array.isArray(value)) {
                            let arrStr = JSON.stringify(value, null, 2);
                            let arrLines = arrStr.split('\n').length;
                            let arrLineStart = keyLine + 1;
                            let arrLineEnd = arrLineStart + arrLines - 1;
                            if (cursorLine >= arrLineStart && cursorLine <= arrLineEnd) {
                                let sub = findPath(value, arrLineStart, arrLineEnd, path.concat(key), typePath.concat([{ key, type: 'array' }]));
                                return sub.length ? sub : typePath.concat([{ key, type: 'array' }]);
                            }
                        }
                    }
                }
            }
            return typePath;
        }

        function getType(node) {
            if (Array.isArray(node)) return 'array';
            if (typeof node === 'object' && node !== null) {
                if (node.type) return node.type;
                if (node.name) return node.name;
                return 'object';
            }
            return typeof node;
        }

        let typePath = findPath(json, 0, lines.length - 1, [], []);
        window.currentJsonCursorPath = typePath;
        // Для отображения карты пути оставляем старую логику
        let node = json;
        let result = [];
        let path = typePath.map(p => p.key);
        // root с NAME, MANUFACTURER, MODEL
        let rootName = node && node.name ? node.name : '';
        let rootManuf = (rootName === '') ? (node && node.manufacturer ? node.manufacturer : '') : '';
        let rootModel = (rootName === '') ? (node && node.model ? node.model : '') : '';
        let rootFields = [rootName, rootManuf, rootModel].filter(Boolean).join(' ');
        if (rootFields) {
            result.push(`root (${rootFields})`);
        } else {
            result.push('root');
        }
        for (let i = 0; i < path.length; i++) {
            let key = path[i];
            if (key === 'services' && typeof path[i + 1] === 'number') {
                let idx = path[i + 1];
                node = node.services && node.services[idx];
                let name = node && node.name ? node.name : '';
                let type = node && node.type ? node.type : '';
                let fields = [name, type].filter(Boolean).join('; ');
                if (fields) {
                    result.push(`Сервис ${idx} (${fields})`);
                } else {
                    result.push(`Сервис ${idx}`);
                }
                i++;
            } else if (key === 'characteristics' && typeof path[i + 1] === 'number') {
                let idx = path[i + 1];
                node = node.characteristics && node.characteristics[idx];
                let type = node && node.type ? node.type : '';
                if (type) {
                    result.push(`Характеристика ${idx} (${type})`);
                } else {
                    result.push(`Характеристика ${idx}`);
                }
                i++;
            } else if (key === 'options' && typeof path[i + 1] === 'number') {
                let idx = path[i + 1];
                node = node.options && node.options[idx];
                let name = node && node.name ? node.name : '';
                let type = node && node.type ? node.type : '';
                let fields = [name, type].filter(Boolean).join('; ');
                if (fields) {
                    result.push(`Опция ${idx} (${fields})`);
                } else {
                    result.push(`Опция ${idx}`);
                }
                i++;
            } else if (key === 'link' && typeof path[i + 1] === 'number') {
                let idx = path[i + 1];
                result.push(`Линк ${idx}`);
                i++;
            }
        }
        // Рендерим кликабельные крошки с точной навигацией по сформированному пути
        mapDiv.innerHTML = '';
        const frag = document.createDocumentFragment();
        const makeCrumb = (label, onClick) => {
            const span = document.createElement('span');
            span.textContent = label;
            span.style.cursor = onClick ? 'pointer' : 'default';
            if (onClick) span.addEventListener('click', onClick);
            return span;
        };
        const sep = () => {
            const s = document.createElement('span');
            s.textContent = ' > ';
            s.style.opacity = '0.6';
            return s;
        };

        const anchor = window.lastCursorPosition || { line: 0, ch: 0 };

        // Находит позицию начала первого ключа (первой кавычки) начиная с заданной строки вниз
        function findFirstKeyPos(startLine) {
            const lc = window.editor.lineCount();
            const maxScan = Math.min(lc, startLine + 100);
            for (let i = startLine; i < maxScan; i++) {
                const text = window.editor.getLine(i) || '';
                // пропускаем пустые и строки с только скобками/знаками
                if (/^\s*[\{\}\[\]\}\,]*\s*$/.test(text)) continue;
                const idx = text.indexOf('"');
                if (idx >= 0) return { line: i, ch: idx };
                const nonSpace = text.search(/\S/);
                if (nonSpace >= 0) return { line: i, ch: nonSpace };
            }
            return { line: Math.max(0, startLine), ch: 0 };
        }
        const crumbPaths = [];
        // root path (не используется для вычислений, сохраняем структуру массивов)
        crumbPaths.push('');

        // Накопители индексов для построения путей
        let lastServiceIndex = null;
        let lastCharIndex = null;
        let lastOptionIndex = null;

        // Пробегаем фактический path, формируя crumbPaths синхронно с result
        for (let i = 0; i < path.length; i++) {
            const key = path[i];
            if (key === 'services' && typeof path[i + 1] === 'number') {
                lastServiceIndex = path[i + 1];
                lastCharIndex = null;
                crumbPaths.push(`services[${lastServiceIndex}]`);
                i += 1;
                continue;
            }
            if (key === 'characteristics' && typeof path[i + 1] === 'number' && lastServiceIndex != null) {
                lastCharIndex = path[i + 1];
                crumbPaths.push(`services[${lastServiceIndex}].characteristics[${lastCharIndex}]`);
                i += 1;
                continue;
            }
            if (key === 'options' && typeof path[i + 1] === 'number') {
                lastOptionIndex = path[i + 1];
                lastCharIndex = null;
                crumbPaths.push(`options[${lastOptionIndex}]`);
                i += 1;
                continue;
            }
            if (key === 'link' && typeof path[i + 1] === 'number') {
                const linkIdx = path[i + 1];
                if (lastServiceIndex != null && lastCharIndex != null) {
                    crumbPaths.push(`services[${lastServiceIndex}].characteristics[${lastCharIndex}].link[${linkIdx}]`);
                } else if (lastOptionIndex != null) {
                    crumbPaths.push(`options[${lastOptionIndex}].link[${linkIdx}]`);
                } else {
                    crumbPaths.push(`link[${linkIdx}]`);
                }
                i += 1;
                continue;
            }
        }

        // root — возвращаемся к позиции, где были (якорь)
        frag.appendChild(makeCrumb(result[0] || 'root', () => {
            window.__suppressCursorPathUpdate = true;
            window.editor.scrollIntoView(anchor, 100);
            window.editor.setCursor(anchor);
            window.editor.focus();
            // Обновляем сохранённые координаты курсора и путь
            try {
                window.lastCursorPosition = anchor;
                window.lastCursorPath = window.getCurrentJsonPath(window.editor);
            } catch(_) {}
            setTimeout(() => {
                window.__suppressCursorPathUpdate = false;
                updateCursorPathMap();
                if (typeof window.updateToolbarButtonsVisibility === 'function') window.updateToolbarButtonsVisibility();
            }, 0);
        }));

        for (let i = 1; i < result.length; i++) {
            frag.appendChild(sep());
            const label = result[i];
            const hlPath = crumbPaths[i] || '';
            frag.appendChild(makeCrumb(label, () => {
                // Переходим к выбранному элементу без гонок обновления карты пути
                try {
                    window.__suppressCursorPathUpdate = true;
                    const jsonStr = window.editor.getValue();
                    if (typeof window.highlightErrorLine === 'function') {
                        const line = window.highlightErrorLine(hlPath, jsonStr);
                        if (line && line > 0) {
                            const targetLine = line - 1;
                            const pos = findFirstKeyPos(targetLine);
                            window.editor.scrollIntoView(pos, 100);
                            window.editor.setCursor(pos);
                            window.editor.focus();
                            try { window.editor.removeLineClass(targetLine, 'background', 'error-line'); } catch (_) {}
                            // Обновляем сохранённые координаты курсора и путь
                            try {
                                window.lastCursorPosition = pos;
                                window.lastCursorPath = window.getCurrentJsonPath(window.editor);
                            } catch(_) {}
                        } else {
                            window.editor.scrollIntoView(anchor, 100);
                            window.editor.setCursor(anchor);
                            window.editor.focus();
                            try {
                                window.lastCursorPosition = anchor;
                                window.lastCursorPath = window.getCurrentJsonPath(window.editor);
                            } catch(_) {}
                        }
                    }
                } finally {
                    setTimeout(() => {
                        window.__suppressCursorPathUpdate = false;
                        updateCursorPathMap();
                        if (typeof window.updateToolbarButtonsVisibility === 'function') window.updateToolbarButtonsVisibility();
                    }, 0);
                }
            }));
        }
        mapDiv.appendChild(frag);
    }

    window.__suppressCursorPathUpdate = window.__suppressCursorPathUpdate || false;

    window.editor.on('cursorActivity', function () {
        if (window.__suppressCursorPathUpdate) return;
        window.lastCursorPosition = window.editor.getCursor();
        window.lastCursorPath = window.getCurrentJsonPath(window.editor);
        updateCursorPathMap();
        persistCursorAndScroll();
        // Обновляем видимость кнопок тулбара
        if (typeof window.updateToolbarButtonsVisibility === 'function') {
            window.updateToolbarButtonsVisibility();
        }
    });

    window.editor.on('focus', function () {
        if (window.__suppressCursorPathUpdate) return;
        window.lastCursorPosition = window.editor.getCursor();
        window.lastCursorPath = window.getCurrentJsonPath(window.editor);
        updateCursorPathMap();
        persistCursorAndScroll();
        // Обновляем видимость кнопок тулбара
        if (typeof window.updateToolbarButtonsVisibility === 'function') {
            window.updateToolbarButtonsVisibility();
        }
    });

    // --- Форматирование JSON ---
    window.formatFromOneClick = false;
    window.formatJson = function () {
        try {
            const value = window.editor.getValue();
            if (!value.trim()) {
                document.getElementById('errorOutput').innerHTML = `<ul><li>Необходимо сперва открыть файл шаблона</li></ul>`;
                return;
            }
            if (!window.formatFromOneClick) {
                document.getElementById('errorOutput').textContent = '';
                document.getElementById('correctionOutput').textContent = '';
                document.getElementById('autoFixContainer').innerHTML = '';
            }
            const json = JSON.parse(value);
            window.editor.setValue(JSON.stringify(json, null, 2));
            if (!window.formatFromOneClick) {
                document.getElementById('correctionOutput').innerHTML = `<ul><li>Форматирование успешно выполнено</li></ul>`;
            }
            window.editor.refresh();
        } catch (e) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка форматирования: ${e.message}</li></ul>`;
        }
    };

    // --- Автокомплит ---
    window.getCurrentJsonPath = function (cm) {
        try {
            const pos = cm.getCursor();
            const lines = cm.getValue().split('\n');
            let upto = lines.slice(0, pos.line + 1).join('\n');
            upto = upto.slice(0, upto.length - (lines[pos.line].length - pos.ch));
            let path = [];
            let stack = [];
            let currentKey = '';
            let inString = false;
            let escape = false;
            let arrayIndex = 0;
            let inArray = false;
            let lastKey = '';

            for (let i = 0; i < upto.length; i++) {
                const c = upto[i];
                if (escape) {
                    escape = false;
                    continue;
                }
                if (c === '\\') {
                    escape = true;
                    continue;
                }
                if (c === '"') {
                    inString = !inString;
                    continue;
                }
                if (!inString) {
                    if (c === '{') {
                        stack.push('object');
                        inArray = false;
                        continue;
                    }
                    if (c === '[') {
                        stack.push('array');
                        inArray = true;
                        arrayIndex = 0;
                        continue;
                    }
                    if (c === '}') {
                        if (stack.length > 0 && stack[stack.length - 1] === 'object') {
                            stack.pop();
                            inArray = false;
                            if (stack.length <= 1) {
                                path = [];
                            }
                        }
                        continue;
                    }
                    if (c === ']') {
                        if (stack.length > 0 && stack[stack.length - 1] === 'array') {
                            stack.pop();
                            inArray = stack.length > 0 && stack[stack.length - 1] === 'array';
                        }
                        continue;
                    }
                    if (c === ':') {
                        if (currentKey.trim()) {
                            lastKey = currentKey.trim().replace(/"/g, '');
                            path.push(lastKey);
                            currentKey = '';
                        }
                        continue;
                    }
                    if (c === ',') {
                        if (inArray && stack.length > 0 && stack[stack.length - 1] === 'array') {
                            arrayIndex++;
                        }
                        currentKey = '';
                        continue;
                    }
                }
                if (inString) {
                    currentKey += c;
                }
            }

            if (inArray && stack.length > 0 && stack[stack.length - 1] === 'array') {
                path.push(arrayIndex);
            }

            if (stack.length <= 1) {
                const currentLine = lines[pos.line];
                const beforeCursor = currentLine.slice(0, pos.ch);
                const afterCursor = currentLine.slice(pos.ch);
                if (/^\s*,?\s*$/.test(beforeCursor) && /^\s*$/.test(afterCursor)) {
                    path = [];
                }
            }

            // Отладочная информация
    
            return path;
        } catch (e) {
            console.error('Error in getCurrentJsonPath:', e);
            return [];
        }
    };

    // --- Восстановление и применение темы ---
    window.initTheme();

    // --- Инициализация контекстного меню ---
    if (typeof window.initContextMenu === 'function') {
        window.initContextMenu();
    }
    
    if (typeof window.setupEditorContextMenu === 'function') {
        window.setupEditorContextMenu();
    }

    // --- Wizard runtime ---
    (function initWizard() {
        const dlg = document.getElementById('wizardDialog');
        if (!dlg) return;
        const titleEl = document.getElementById('wizardTitle');
        const bodyEl = document.getElementById('wizardBody');
        const backBtn = document.getElementById('wizardBackBtn');
        const closeBtn = document.getElementById('wizardCloseBtn');
        const prevBtn = document.getElementById('wizardPrevBtn');
        const nextBtn = document.getElementById('wizardNextBtn');
        const doneBtn = document.getElementById('wizardDoneBtn');

        const LS_KEY = 'wizardProgressV1';
        const defaultState = {
            step: 0,
            controller: '',
            inProgress: false,
            template: { manufacturer: '', model: '', manufacturerId: '', modelId: '', catalogId: 0, services: [], options: [] },
            selectedServices: [],
            serviceIdx: 0
        };
        let state = { ...defaultState };
        // Множество типов характеристик, уже имеющихся в целевом сервисе редактора,
        // когда мастер открыт в режиме добавления характеристик
        let existingCharTypes = null; // Set<string> | null
        // Подсказки для полей мастера
        const FIELD_TIPS = {
            // Верхний уровень шаблона
            'template.manufacturer': 'Производитель устройства. Будет отображаться в карточке устройства.',
            'template.model': 'Модель устройства.  Будет отображаться в карточке устройства.',
            'template.manufacturerId': 'Идентификатор производителя.',
            // Сервис
            'service.name': 'Отображаемое имя сервиса в Sprut.Hub.',
            'service.type': 'Тип сервиса. Можно посмотреть список нажав кнопку Типы сервисов.',
            'service.visible': 'Показывать сервис в интерфейсе Sprut.Hub.',
            'service.logics': 'Дополнительные логики (поведения) сервиса. Отметьте нужные.',
            // Идентификаторы
            'template.modelId.base': 'Идентификатор модели устройства.',
            'template.modelId.mqtt': 'MQTT: путь топика с регулярным выражением.',
            'template.catalogId': 'Идентификатор устройства в каталоге sprut.ai.',
            // Характеристика
            'char.minValue': 'Минимально допустимое значение характеристики.',
            'char.maxValue': 'Максимально допустимое значение характеристики.',
            'char.minStep': 'Шаг изменения значения.',
            'char.unit': 'Единица измерения (например "°C", "%", "V").',
            'char.read': 'Разрешено чтение значения характеристики из контроллера.',
            'char.write': 'Разрешена запись/управление значением характеристики.',
            'char.validValues': 'Список допустимых значений.',
            // Link общие поля
            'link.type': 'Тип входящих данных.',
            'link.inFunc': 'Функция преобразования входящих данных (JS-выражение).',
            'link.outFunc': 'Функция преобразования исходящих данных (JS-выражение).',
            'link.map': 'Сопоставление входящих значений → внутренним.',
            'link.outMap': 'Сопоставление исходящих значений → внешним.',
            'link.scale': 'Масштабирование значения. Например, 0.1 или 10.',
            'link.section': 'Привязка к данным контроллера: где читать и куда писать значение.',
            // Контроллер-специфичные поля
            'link.address': 'Адрес (регистра/устройства) для ModBus.',
            'link.function': 'Код функции (ModBus function).',
            'link.topicGet': 'MQTT топик для чтения значения (поддерживает группы из modelId).',
            'link.topicSet': 'MQTT топик для записи значения (поддерживает группы из modelId).',
            'link.endpoint': 'ZigBee endpoint устройства.',
            'link.cluster': 'ZigBee cluster (идентификатор кластера).',
            'link.attribute': 'ZigBee attribute (идентификатор атрибута).',
            'link.class': 'Z-Wave Command Class.',
            'link.value': 'Z-Wave Value ID.',
            'link.id': 'Идентификатор для контроллера (например Xiaomi).',
            'link.getProp': 'Имя свойства/команды получения значения (Xiaomi).',
            'link.setProp': 'Имя свойства/команды установки значения (Xiaomi).',
            // Опции
            'option.name': 'Название опции, отображаемое в параметрах устройства.',
            'option.inputType': 'Тип элемента управления в параметрах устройства (select, switch, number и т.п.).',
            'options.note': 'Опции отображаются в Параметрах устройства.'
        };
        function escapeTipText(s) {
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        function tipByKey(key, fallback) {
            const text = FIELD_TIPS[key] || fallback || '';
            return text ? ` <span class='help-icon' data-tip='${escapeTipText(text)}'>?</span>` : '';
        }
        function tipForLinkField(fieldName) {
            return tipByKey(`link.${fieldName}`, 'Поле привязки контроллера.');
        }
        // Экспортные режимы открытия отдельных шагов визарда
        let externalMode = null; // 'addService' | 'addCharacteristics' | 'addLink' | 'addOption'
        let externalStartStep = null; // стартовый шаг для режима добавления
        let externalCallback = null;
        function finishExternal(payload) {
            try { if (typeof externalCallback === 'function') externalCallback(payload); } catch {}
            try { localStorage.removeItem(LS_KEY); } catch {}
            externalMode = null; externalCallback = null; resetState(); close();
        }

        function saveState() {
            if (externalMode) return; // при запуске через кнопки добавления не сохраняем в LS
            try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
        }
        function loadState() {
            try {
                const raw = localStorage.getItem(LS_KEY);
                if (raw) state = { ...defaultState, ...JSON.parse(raw) };
            } catch {}
        }
        function resetState() {
            state = { ...defaultState };
            // не сохраняем пустое состояние, очищаем сохранённые данные
            try { localStorage.removeItem(LS_KEY); } catch {}
        }
        function open() { dlg.style.display = 'flex'; }
        function close() { dlg.style.display = 'none'; }

        // Прокрутка наверх при смене шага
        function scrollWizardTop() {
            try { bodyEl.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { bodyEl.scrollTop = 0; }
        }

        window.startTemplateWizard = function(controllerValue) {
            loadState();
            if (controllerValue) state.controller = controllerValue;
            state.inProgress = true;
            if (typeof state.step !== 'number' || state.step < 0) state.step = 0;
            saveState();
            render();
            open();
        };

        // Автооткрытие если был прогресс
        try {
            const rawSaved = localStorage.getItem(LS_KEY);
            if (rawSaved) {
                const saved = JSON.parse(rawSaved);
                if (saved && saved.inProgress === true && typeof saved.step === 'number' && saved.step >= 0) {
                    state = { ...defaultState, ...saved };
                    render();
                    open();
                }
            }
        } catch {}

        function render() {
            const startStep = (typeof externalStartStep === 'number') ? externalStartStep : 0;
            const canGoBack = state.step > startStep;
            backBtn.style.display = canGoBack ? '' : 'none';
            prevBtn.style.display = canGoBack ? '' : 'none';
            doneBtn.style.display = 'none';
            nextBtn.style.display = '';
            if (state.step === 0) renderTemplateMeta();
            else if (state.step === 1) renderServiceSelect();
            else if (state.step === 2) renderServiceForm();
            else if (state.step === 3) renderCharacteristicsSelect();
            else if (state.step === 4) {
                if (externalMode === 'addLink') renderCharacteristicLinkWizard();
                else renderCharacteristicsForms();
            }
            else if (state.step === 5) renderOptionsStep();
        }

        // Если схема подгружается после обновления страницы на середине мастера,
        // перерисуем текущий шаг, чтобы заполнить логики и др. списки
        document.addEventListener('schemaLoaded', () => {
            try {
                if (dlg.style.display !== 'none' && state && typeof state.step === 'number') {
                    render();
                }
            } catch (e) {}
        });

        // Публичные функции для запуска отдельных сценариев визарда
        window.startWizardAddService = function(onDone) {
            loadState();
            externalMode = 'addService';
            externalCallback = onDone;
            state = { ...defaultState, step: 1, inProgress: false, controller: document.getElementById('controllerSelect')?.value || '' };
            // Сбрасываем выбранные ранее сервисы
            state.selectedServices = [];
            externalStartStep = 1;
            render(); open();
        };
        window.startWizardAddCharacteristics = function(serviceType, onDone, existingTypes) {
            if (!serviceType) return;
            loadState();
            externalMode = 'addCharacteristics';
            externalCallback = onDone;
            state = { ...defaultState, step: 3, inProgress: false, controller: document.getElementById('controllerSelect')?.value || '' };
            state.template.services = [{ name: '', type: serviceType, visible: true, characteristics: [] }];
            state.serviceIdx = 0;
            existingCharTypes = Array.isArray(existingTypes) ? new Set(existingTypes.filter(Boolean)) : null;
            externalStartStep = 3;
            render(); open();
        };
        window.startWizardAddLink = function(serviceType, characteristicType, onDone) {
            if (!serviceType || !characteristicType) return;
            loadState();
            externalMode = 'addLink';
            externalCallback = onDone;
            state = { ...defaultState, step: 4, inProgress: false, controller: document.getElementById('controllerSelect')?.value || '' };
            state.template.services = [{ name: '', type: serviceType, visible: true, characteristics: [{ type: characteristicType, link: [] }] }];
            state.serviceIdx = 0;
            externalStartStep = 4;
            open();
            renderCharacteristicLinkWizard();
        };
        window.startWizardAddOption = function(onDone) {
            loadState();
            externalMode = 'addOption';
            externalCallback = onDone;
            open();
            // отрисуем сразу форму новой опции
            renderOptionWizard();
        };

        function renderTemplateMeta() {
            titleEl.textContent = 'Данные шаблона';
            const isMQTT = (state.controller||'')==='MQTT';
            const manuRow = `<div class='form-row'><label>Производитель${tipByKey('template.manufacturer')}</label><input id='w_manu' type='text' value='${state.template.manufacturer || ''}' /></div>`;
            const modelRow = `<div class='form-row'><label>Модель${tipByKey('template.model')}</label><input id='w_model' type='text' value='${state.template.model || ''}' /></div>`;
            const manuIdRow = isMQTT ? '' : `<div class='form-row'><label>manufacturerId${tipByKey('template.manufacturerId')}</label><input id='w_manuId' type='text' value='${state.template.manufacturerId || ''}' /></div>`;
            const modelIdTip = isMQTT ? tipByKey('template.modelId.mqtt') : tipByKey('template.modelId.base');
            const modelIdRow = `<div class='form-row'><label>modelId${modelIdTip}</label><input id='w_modelId' type='text' value='${state.template.modelId || ''}' /></div>`;
            const catalogIdRow = `<div class='form-row'><label>catalogId${tipByKey('template.catalogId')}</label><input id='w_catalogId' type='number' value='${state.template.catalogId || 0}' /></div>`;
            bodyEl.innerHTML = manuRow + modelRow + manuIdRow + modelIdRow + catalogIdRow;
            nextBtn.onclick = () => {
                state.template.manufacturer = document.getElementById('w_manu').value.trim();
                state.template.model = document.getElementById('w_model').value.trim();
                if (!isMQTT) state.template.manufacturerId = document.getElementById('w_manuId').value.trim(); else delete state.template.manufacturerId;
                state.template.modelId = document.getElementById('w_modelId').value.trim();
                state.template.catalogId = parseInt(document.getElementById('w_catalogId').value, 10) || 0;
                state.step = 1; saveState(); scrollWizardTop(); render();
            };
        }

        function renderServiceSelect() {
            titleEl.textContent = 'Выбор сервисов';
            const servicesAll = (window.shTypes || []).slice().sort((a, b) => (a.name||'').localeCompare(b.name||'', 'ru'));
            bodyEl.innerHTML = `<div class='section-title'>Отметьте сервисы</div>
                <div class='form-row'><input id='w_svc_search' type='text' placeholder='Поиск по названию или типу...'/></div>
                <div id='w_svc_list'></div>`;
            const listEl = document.getElementById('w_svc_list');
            const searchEl = document.getElementById('w_svc_search');
            function renderList(filter='') {
                const q = filter.trim().toLowerCase();
                const services = q ? servicesAll.filter(s => (s.name||'').toLowerCase().includes(q) || (s.type||'').toLowerCase().includes(q)) : servicesAll;
                const items = services.map((s) => {
                    const checked = state.selectedServices.includes(s.type) ? 'checked' : '';
                    return `<div class='service-block'>
                        <label><input type='checkbox' data-type='${s.type}' ${checked}/> ${s.name || s.type} <span style='opacity:.6'>(${s.type})</span></label>
                    </div>`;
                }).join('');
                listEl.innerHTML = items || '<div>Ничего не найдено</div>';
                listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', () => {
                        const t = cb.getAttribute('data-type');
                        if (cb.checked) { if (!state.selectedServices.includes(t)) state.selectedServices.push(t); }
                        else { state.selectedServices = state.selectedServices.filter(x => x !== t); }
                        saveState();
                    });
                });
                // Полоска сервиса кликабельна целиком
                listEl.querySelectorAll('.service-block').forEach(block => {
                    block.addEventListener('click', (e) => {
                        if (e.target.closest('input') || e.target.closest('label')) return; // стандартное поведение
                        const cb = block.querySelector('input[type="checkbox"]');
                        if (!cb) return;
                        cb.checked = !cb.checked;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                });
            }
            renderList();
            searchEl.addEventListener('input', () => renderList(searchEl.value));
            nextBtn.onclick = () => {
                if (!state.selectedServices.length) { window.showToast('Выберите хотя бы один сервис', 'warning'); return; }
                // Сформировать пустые сервисы в шаблоне (visible по умолчанию true)
                state.template.services = state.selectedServices.map(t => ({ name: '', type: t, visible: true, characteristics: [], logics: [] }));
                state.serviceIdx = 0;
                state.step = 2; saveState(); scrollWizardTop(); render();
            };
            prevBtn.onclick = () => { state.step = 0; saveState(); render(); };
        }

        function renderServiceForm() {
            const svc = state.template.services[state.serviceIdx];
            const svcDef = (window.shTypes||[]).find(s=>s.type===svc.type);
            const svcNameRu = (svcDef && svcDef.name) ? svcDef.name : svc.type;
            titleEl.textContent = `Параметры сервиса ${svcNameRu} (${state.serviceIdx+1}/${state.template.services.length})`;
            const logicEnum = (window.schema && window.schema.$defs && window.schema.$defs.logics && window.schema.$defs.logics.properties && window.schema.$defs.logics.properties.type && window.schema.$defs.logics.properties.type.enum) ? window.schema.$defs.logics.properties.type.enum : [];
            const selectedLogic = new Set((svc.logics||[]).map(l=>l.type));
            const logicItemsHtml = logicEnum.map(t=>`<label style='display:block;'><input type='checkbox' data-logic='${t}' ${selectedLogic.has(t)?'checked':''}/> ${t}</label>`).join('');
            const logicBlockInner = logicItemsHtml || `<div style='opacity:.7;font-size:13px;'>Нет доступных логик</div>`;
            const logicHtml = `<div class='section-title' id='w_logic_toggle' style='cursor:pointer;user-select:none;'>Логика${tipByKey('service.logics')} <span id='w_logic_arrow' style='font-size:12px;'>&#9654;</span></div>
                <div class='service-block' id='w_logic_block' style='display:none;'>${logicBlockInner}</div>`;
            bodyEl.innerHTML = `
                <div class='form-row'><label>Название (name)${tipByKey('service.name')}</label><input id='w_svc_name' type='text' value='${svc.name || svcNameRu}'/></div>
                <div class='form-row is-disabled'><label>Тип (type)${tipByKey('service.type')}</label><input id='w_svc_type' type='text' value='${svc.type || ''}' disabled/></div>
                <div class='form-row'><label>Видимый (visible)${tipByKey('service.visible')}</label><input id='w_svc_visible' type='checkbox' ${svc.visible !== false ? 'checked' : ''}/></div>
                ${logicHtml}
            `;
            // переключение разворота логики
            const logicToggle = document.getElementById('w_logic_toggle');
            const logicBlock = document.getElementById('w_logic_block');
            const logicArrow = document.getElementById('w_logic_arrow');
            if (logicToggle && logicBlock && logicArrow) {
                logicToggle.addEventListener('click', () => {
                    const isHidden = logicBlock.style.display === 'none';
                    logicBlock.style.display = isHidden ? '' : 'none';
                    logicArrow.innerHTML = isHidden ? '&#9660;' : '&#9654;';
                });
            }
            nextBtn.onclick = () => {
                svc.name = document.getElementById('w_svc_name').value.trim();
                svc.visible = document.getElementById('w_svc_visible').checked;
                const checks = Array.from(bodyEl.querySelectorAll('input[data-logic]'));
                const selected = checks.filter(cb=>cb.checked).map(cb=>({ type: cb.getAttribute('data-logic'), active: true }));
                svc.logics = selected.length ? selected : undefined;
                state.step = 3; saveState(); scrollWizardTop(); render();
            };
            prevBtn.onclick = () => { state.step = 1; saveState(); render(); };
        }

        function renderCharacteristicsSelect() {
            const svc = state.template.services[state.serviceIdx];
            const def = (window.shTypes || []).find(s => s.type === svc.type) || { required: [], optional: [] };
            const svcNameRu = def && def.name ? def.name : svc.type;
            titleEl.textContent = `Выбор характеристик ${svc.name || ''} (${svcNameRu})`;
            const getObj = t => (typeof t === 'object' ? t : { type: t });
            const req = (def.required || []).map(getObj).filter(c=>c.type!=='Name');
            const opt = (def.optional || []).map(getObj).filter(c=>c.type!=='Name');
            // Автовыбор обязательных характеристик
            const selected = new Set((svc.characteristics||[]).map(c=>c.type));
            // Автодобавление обязательных характеристик только в полном мастере, не при добавлении через тулбар
            if (!externalMode) {
                req.forEach(c => { if (!selected.has(c.type)) { selected.add(c.type); svc.characteristics.push({ type: c.type, link: [] }); } });
            }
            // Список всех остальных типов из shTypes, которых нет в req/opt
            const usedTypes = new Set([...req, ...opt].map(c => c.type));
            let globalAll = [];
            if (Array.isArray(window.shTypes)) {
                const seen = new Set();
                window.shTypes.forEach(s => {
                    (s.required||[]).forEach(t=>{ const o=getObj(t); if(o.type && !seen.has(o.type)){ seen.add(o.type); globalAll.push(o);} });
                    (s.optional||[]).forEach(t=>{ const o=getObj(t); if(o.type && !seen.has(o.type)){ seen.add(o.type); globalAll.push(o);} });
                });
            }
            const sortByName = (a, b) => {
                const A = (a.name || a.type || '').toLowerCase();
                const B = (b.name || b.type || '').toLowerCase();
                return A.localeCompare(B, 'ru', { sensitivity: 'base' });
            };
            const others = globalAll.filter(c => !usedTypes.has(c.type) && c.type !== 'Name').sort(sortByName);
            const reqHtml = req.map(c=>{
                const existsInCurrentSvc = (svc.characteristics||[]).some(x=>x.type===c.type);
                // В полном мастере (не externalMode) обязательные характеристики не помечаем как «уже добавлена» и не дизейблим
                const exists = (externalMode === 'addCharacteristics') && (existsInCurrentSvc || (existingCharTypes && existingCharTypes.has(c.type)));
                const disabledAttr = exists ? 'disabled' : '';
                const already = exists ? ` <span style='font-size:11px;color:#c00;'>(уже добавлена)</span>` : '';
                const ch = (!exists) ? 'checked' : '';
                return `<div class='char-block'><label><input type='checkbox' data-type='${c.type}' ${disabledAttr} ${ch}/> ${c.name||c.type} <span style='opacity:.6'>(${c.type})</span>${already}</label></div>`;
            }).join('');
            const optHtml = opt.map(c=>{
                const exists = externalMode === 'addCharacteristics' && existingCharTypes && existingCharTypes.has(c.type);
                const disabledAttr = exists ? 'disabled' : '';
                const already = exists ? ` <span style='font-size:11px;color:#c00;'>(уже добавлена)</span>` : '';
                const ch = selected.has(c.type) && !exists ? 'checked' : '';
                return `<div class='char-block'><label><input type='checkbox' data-type='${c.type}' ${disabledAttr} ${ch}/> ${c.name||c.type} <span style='opacity:.6'>(${c.type})</span>${already}</label></div>`;
            }).join('');
            const otherToggleId = 'w_char_other_toggle';
            const otherListId = 'w_char_other_list';
            const otherHeader = others.length ? `<div class='section-title' id='${otherToggleId}' style='cursor:pointer;user-select:none;'>Остальные характеристики <span style='font-size:smaller;color:#888;'>(устройства с нестандартными характеристиками могут не прокидываться в другие системы)</span> <span id='${otherToggleId}-arrow' style='font-size:12px;'>&#9654;</span></div>` : '';
            const otherItems = others.map(c=>{
                const exists = externalMode === 'addCharacteristics' && existingCharTypes && existingCharTypes.has(c.type);
                const disabledAttr = exists ? 'disabled' : '';
                const already = exists ? ` <span style='font-size:11px;color:#c00;'>(уже добавлена)</span>` : '';
                const ch = selected.has(c.type) && !exists ? 'checked' : '';
                return `<div class='char-block'><label><input type='checkbox' data-type='${c.type}' ${disabledAttr} ${ch}/> ${c.name||c.type} <span style='opacity:.6'>(${c.type})</span>${already}</label></div>`;
            }).join('');
            const otherBlock = others.length ? `<div id='${otherListId}' style='display:none;'>${otherItems}</div>` : '';
            bodyEl.innerHTML = `<div class='section-title'>Обязательные</div>${reqHtml || '<div>—</div>'}
                <div class='section-title'>Опциональные</div>${optHtml || '<div>—</div>'}
                ${otherHeader}${otherBlock}`;
            bodyEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => {
                    const t = cb.getAttribute('data-type');
                    if (cb.checked) {
                        if (!svc.characteristics.some(x => x.type === t)) svc.characteristics.push({ type: t, link: [] });
                    } else {
                        svc.characteristics = svc.characteristics.filter(x => x.type !== t);
                    }
                    saveState();
                });
            });
            // Клик по блоку характеристики переключает чекбокс
            bodyEl.querySelectorAll('.char-block').forEach(block => {
                block.addEventListener('click', (e) => {
                    if (e.target.closest('input') || e.target.closest('label')) return;
                    const cb = block.querySelector('input[type="checkbox"]');
                    if (!cb || cb.disabled) return;
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                });
            });
            // Тогглер для "остальных"
            const section = document.getElementById(otherToggleId);
            const list = document.getElementById(otherListId);
            const arrow = document.getElementById(`${otherToggleId}-arrow`);
            if (section && list && arrow) {
                section.addEventListener('click', ()=>{
                    const hidden = list.style.display === 'none';
                    list.style.display = hidden ? '' : 'none';
                    arrow.innerHTML = hidden ? '&#9660;' : '&#9654;';
                });
            }
            nextBtn.onclick = () => {
                // Собираем отмеченные чекбоксы
                const chosen = Array.from(bodyEl.querySelectorAll('input[type="checkbox"][data-type]:not(:disabled)'))
                    .filter(cb => cb.checked)
                    .map(cb => cb.getAttribute('data-type'));
                if (!chosen.length) {
                    window.showToast('Выберите хотя бы одну характеристику', 'warning');
                    return;
                }
                // В режимах добавления (сервис/характеристики) фиксируем выбранные, не переносим автоматически обязательные
                if (externalMode === 'addCharacteristics' || externalMode === 'addService') {
                    const typesSet = new Set(chosen);
                    const keep = (svc.characteristics||[]).filter(ch => typesSet.has(ch.type));
                    const needToAdd = chosen.filter(t => !keep.some(ch => ch.type === t));
                    const added = needToAdd.map(t => ({ type: t, link: [] }));
                    svc.characteristics = [...keep, ...added];
                }
                state.step = 4; saveState(); scrollWizardTop(); render();
            };
            prevBtn.onclick = () => { state.step = 2; saveState(); render(); };
        }

        function renderCharacteristicsForms() {
            const svc = state.template.services[state.serviceIdx];
            const svcDef = (window.shTypes||[]).find(s=>s.type===svc.type);
            const svcNameRu = (svcDef && svcDef.name) ? svcDef.name : svc.type;
            titleEl.textContent = `Параметры характеристик (${svcNameRu})`;
            const controller = document.getElementById('controllerSelect')?.value || state.controller;
            const ctrlFields = (window.controllerLinkFields && controller) ? window.controllerLinkFields[controller] : null;
            const required = ctrlFields ? (ctrlFields.required || []) : [];
            const readField = ctrlFields ? ctrlFields.read : null;
            const writeField = ctrlFields ? ctrlFields.write : null;
            const makeLinkFields = () => {
                const fields = new Set(required);
                if (readField) fields.add(readField);
                if (writeField) fields.add(writeField);
                return Array.from(fields);
            };
            const linkTypeEnum = (window.schema && window.schema.$defs && window.schema.$defs.link && window.schema.$defs.link.properties && window.schema.$defs.link.properties.type && window.schema.$defs.link.properties.type.enum) ? window.schema.$defs.link.properties.type.enum : [];
            const charHtml = (svc.characteristics||[]).map((c, idx) => {
                // русское имя характеристики
                let charDef = null;
                if (svcDef) {
                    const list = [...(svcDef.required||[]), ...(svcDef.optional||[])].map(x=> (typeof x==='object'?x:{type:x}));
                    charDef = list.find(x=>x.type===c.type) || null;
                }
                const charNameRu = (charDef && charDef.name) ? charDef.name : c.type;
                const baseFields = makeLinkFields();
                // Функция получения списка validValues из sh_types (enum или validValues)
                const getValidKeys = () => {
                    const keys = [];
                    if (charDef && charDef.enum && typeof charDef.enum === 'object') {
                        for (const k of Object.keys(charDef.enum)) keys.push(k);
                    }
                    if (charDef && Array.isArray(charDef.validValues) && charDef.validValues.length) {
                        charDef.validValues.forEach(v => { if (v && typeof v.key !== 'undefined') keys.push(String(v.key)); });
                    }
                    return Array.from(new Set(keys));
                };
                const validKeys = getValidKeys();
                // Не записываем дефолтные значения из sh_types в объект характеристики.
                // Дефолты показываем в UI (placeholder/checked), а в шаблон добавляем только изменённые пользователем.
                // Если link отсутствует — создать пустой линк с базовыми полями
                if (!Array.isArray(c.link) || c.link.length === 0) {
                    const init = { type: '' };
                    baseFields.forEach(f => { init[f] = ''; });
                    c.link = [init];
                }
                const linksBlocks = (Array.isArray(c.link)?c.link:[]).map((lnk, li)=>{
                    // для map/outMap и произвольных KV блоков создаём управляемые строки
                    const allFields = new Set(Object.keys(lnk).filter(k=>k!=='type' && k!=='map' && k!=='outMap'));
                    baseFields.forEach(f=>allFields.add(f));
                    allFields.add('inFunc');
                    allFields.add('outFunc');
                    allFields.add('link');
                    // Для числовых форматов добавим scale по умолчанию
                    if ((charDef && (charDef.format === 'Double' || charDef.format === 'Integer')) || (c && (c.format === 'Double' || c.format === 'Integer'))) {
                        allFields.add('scale');
                    }
                    let rows = Array.from(allFields).map(f=>{
                        const v = lnk[f] ?? '';
                        const help = (f === 'map' || f === 'outMap' || f === 'inFunc' || f === 'outFunc' || f === 'scale') ? tipByKey(`link.${f}`) : tipForLinkField(f);
                        return `<div class='kv-row'><label style='min-width:160px;'>${f}${help}</label><input type='text' data-char='${idx}' data-link='${li}' data-field='${f}' value='${v}' /></div>`;
                    }).join('');
                    // map/outMap редактор (динамические пары)
                    const mapPairs = lnk.map || {};
                    const outMapPairs = lnk.outMap || {};
                    const renderPairs = (pairs, group) => {
                        const entries = Object.entries(pairs);
                        const list = entries.map(([k, val], pi)=>
                            `<div class='kv-row'><label style='min-width:160px;'>${group}[${pi}]${tipByKey(`link.${group}`)}</label><input type='text' data-char='${idx}' data-link='${li}' data-${group}-key='${pi}' value='${k}' />
                             <input type='text' data-char='${idx}' data-link='${li}' data-${group}-val='${pi}' value='${val}' />
                             <button class='remove-btn' data-char='${idx}' data-link='${li}' data-remove-${group}='${pi}'>−</button></div>`
                        ).join('');
                        const addLabel = entries.length ? 'Добавить поле' : `Добавить ${group}`;
                        const add = `<div class='kv-row'><button class='toolbar-btn' data-char='${idx}' data-link='${li}' data-add-${group}='1'>${addLabel}</button></div>`;
                        return `<div class='section-title'>${group}${tipByKey(`link.${group}`)}</div>${list}${add}`;
                    };
                    rows += renderPairs(mapPairs, 'map');
                    rows += renderPairs(outMapPairs, 'outMap');
                    const typeSel = `<div class='kv-row'><label style='min-width:160px;'>type${tipByKey('link.type')}</label>
                        <select data-char='${idx}' data-link='${li}' data-field='type'>
                            <option value=''></option>
                            ${linkTypeEnum.map(t=>`<option value='${t}' ${lnk.type===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                        <button class='remove-btn remove-link-btn' data-char='${idx}' data-remove-link='${li}'>✕</button>
                    </div>`;
                    return `<div class='service-block link-block'><div class='link-title'>Линк ${li+1}</div>${typeSel}${rows}</div>`;
                }).join('');
                const addLinkBtn = `<div style='margin:8px 0;'><button class='toolbar-btn' data-add-link='${idx}'>Добавить линк</button></div>`;
                // параметры характеристики (скрываем числовые/единицы для Boolean и String)
                const isBoolean = charDef && charDef.format === 'Boolean';
                const isString = charDef && charDef.format === 'String';
                const minRow = (isBoolean || isString) ? '' : `<div class='kv-row'><label style='min-width:160px;'>minValue${tipByKey('char.minValue')}</label><input type='number' data-charp='${idx}' data-prop='minValue' data-default='${charDef?.minValue ?? ''}' value='${c.minValue ?? ''}' /></div>`;
                const maxRow = (isBoolean || isString) ? '' : `<div class='kv-row'><label style='min-width:160px;'>maxValue${tipByKey('char.maxValue')}</label><input type='number' data-charp='${idx}' data-prop='maxValue' data-default='${charDef?.maxValue ?? ''}' value='${c.maxValue ?? ''}' /></div>`;
                const stepRow = (isBoolean || isString) ? '' : `<div class='kv-row'><label style='min-width:160px;'>minStep${tipByKey('char.minStep')}</label><input type='number' data-charp='${idx}' data-prop='minStep' data-default='${charDef?.minStep ?? ''}' value='${c.minStep ?? ''}' /></div>`;
                const unitRow = (isBoolean || isString) ? '' : `<div class='kv-row'><label style='min-width:160px;'>unit${tipByKey('char.unit')}</label><input type='text' data-charp='${idx}' data-prop='unit' data-default='${charDef?.unit ?? ''}' value='${c.unit || ''}' /></div>`;
                const rRow = `<div class='kv-row'><label style='min-width:160px;'>read${tipByKey('char.read')}</label><input type='checkbox' data-charp='${idx}' data-prop='read' data-default='${!!charDef?.read}' ${ (typeof c.read === 'undefined' ? (!!charDef?.read ? 'checked' : '') : (c.read ? 'checked' : '')) } /></div>`;
                const wRow = `<div class='kv-row'><label style='min-width:160px;'>write${tipByKey('char.write')}</label><input type='checkbox' data-charp='${idx}' data-prop='write' data-default='${!!charDef?.write}' ${ (typeof c.write === 'undefined' ? (!!charDef?.write ? 'checked' : '') : (c.write ? 'checked' : '')) } /></div>`;
                // validValues — показываем из enum или validValues
                let vvHtml = '';
                if (validKeys.length) {
                    const current = new Set((c.validValues||'').split(',').map(s=>s.trim()).filter(Boolean));
                    vvHtml = `<div class='section-title'>validValues${tipByKey('char.validValues')}</div>` +
                        `<div class='service-block'>` +
                        validKeys.map(name => {
                            const ch = current.has(name) ? 'checked' : '';
                            return `<label style='display:block;'><input type='checkbox' data-charvv='${idx}' data-vv='${name}' ${ch}/> ${name}</label>`;
                        }).join('') +
                        `</div>`;
                }
                const header = `<div class='section-title'>Параметры характеристики ${charNameRu} (${c.type}) у ${svc.name || 'NAME'} (${svcNameRu})</div>`;
                return `<div class='char-block'>${header}${minRow}${maxRow}${stepRow}${unitRow}${rRow}${wRow}${vvHtml}<div class='section-title'>Link${tipByKey('link.section')}</div>${linksBlocks}${addLinkBtn}</div>`;
            }).join('');
            bodyEl.innerHTML = charHtml || '<div>Нет выбранных характеристик</div>';
            // Обработчики
            bodyEl.querySelectorAll('input[data-char], select[data-char]').forEach(inp => {
                inp.addEventListener('input', () => {
                    const ci = parseInt(inp.getAttribute('data-char'), 10);
                    const li = inp.getAttribute('data-link');
                    const field = inp.getAttribute('data-field');
                    if (field) {
                        if (!Array.isArray(svc.characteristics[ci].link)) svc.characteristics[ci].link = [];
                        const linkIdx = li !== null && li !== undefined ? parseInt(li, 10) : 0;
                        if (!svc.characteristics[ci].link[linkIdx]) svc.characteristics[ci].link[linkIdx] = {};
                        svc.characteristics[ci].link[linkIdx][field] = inp.value;
                    }
                    saveState();
                });
            });
            // обработка удаления map/outMap элементов
            bodyEl.querySelectorAll('button[data-remove-map], button[data-remove-outMap]').forEach(btn => {
                btn.addEventListener('click',(e)=>{
                    e.preventDefault();
                    const ci = parseInt(btn.getAttribute('data-char'),10);
                    const li = parseInt(btn.getAttribute('data-link'),10);
                    const isOut = btn.hasAttribute('data-remove-outMap');
                    const idx = parseInt(btn.getAttribute(isOut?'data-remove-outMap':'data-remove-map'),10);
                    const link = svc.characteristics[ci].link[li];
                    const group = isOut ? 'outMap':'map';
                    const entries = Object.entries(link[group]||{});
                    if (entries[idx]) {
                        const k = entries[idx][0];
                        delete link[group][k];
                    }
                    saveState();
                    renderCharacteristicsForms();
                });
            });
            // обработка изменений map/outMap ключ/значение
            bodyEl.querySelectorAll('input[data-map-key], input[data-map-val], input[data-outMap-key], input[data-outMap-val]').forEach(inp=>{
                inp.addEventListener('input',()=>{
                    const ci = parseInt(inp.getAttribute('data-char'),10);
                    const li = parseInt(inp.getAttribute('data-link'),10);
                    const isOut = inp.hasAttribute('data-outMap-key') || inp.hasAttribute('data-outMap-val');
                    const isKey = inp.hasAttribute('data-map-key') || inp.hasAttribute('data-outMap-key');
                    const idx = parseInt(inp.getAttribute(isOut? (isKey?'data-outMap-key':'data-outMap-val') : (isKey?'data-map-key':'data-map-val')),10);
                    const link = svc.characteristics[ci].link[li];
                    const group = isOut ? 'outMap':'map';
                    if (!link[group]) link[group] = {};
                    const entries = Object.entries(link[group]);
                    const current = entries[idx] || ['', ''];
                    const newKey = isKey ? inp.value : current[0];
                    const newValRaw = isKey ? current[1] : inp.value;
                    // определение типа значения при сохранении — пока сохраняем строкой, тип выберем на финальном сериализации
                    // обновляем объект: удаляем старый ключ, ставим новый
                    if (current[0] && newKey !== current[0]) delete link[group][current[0]];
                    link[group][newKey] = newValRaw;
                    saveState();
                });
            });
            // добавление пары map/outMap (заполнение всеми ключами validValues, а также true/false для Boolean)
            bodyEl.querySelectorAll('button[data-add-map], button[data-add-outMap]').forEach(btn=>{
                btn.addEventListener('click',(e)=>{
                    e.preventDefault();
                    const ci = parseInt(btn.getAttribute('data-char'),10);
                    const li = parseInt(btn.getAttribute('data-link'),10);
                    const isOut = btn.hasAttribute('data-add-outMap');
                    const link = svc.characteristics[ci].link[li];
                    const group = isOut ? 'outMap':'map';
                    if (!link[group]) link[group] = {};
                    const ch = svc.characteristics[ci];
                    // извлечь charDef и validKeys
                    let def = null; const sDef = (window.shTypes||[]).find(s=>s.type===svc.type);
                    if (sDef) {
                        const lst=[...(sDef.required||[]),...(sDef.optional||[])].map(x=> (typeof x==='object'?x:{type:x}));
                        def = lst.find(x=>x.type===ch.type) || null;
                    }
                    const keys = [];
                    if (def && def.enum) keys.push(...Object.keys(def.enum));
                    if (def && Array.isArray(def.validValues)) def.validValues.forEach(v=>{ if (v && typeof v.key!=='undefined') keys.push(String(v.key)); });
                    const isBool = def && def.format==='Boolean';
                    if (isBool) { keys.push('true','false'); }
                    if (!Object.keys(link[group]).length && keys.length) {
                        keys.forEach(k=>{ if (!Object.prototype.hasOwnProperty.call(link[group],k)) link[group][k]=''; });
                    } else {
                        let i = 0; let key = 'KEY'; while (Object.prototype.hasOwnProperty.call(link[group], key+(i||''))) i++; link[group][key+(i||'')]='';
                    }
                    saveState();
                    renderCharacteristicsForms();
                });
            });
            bodyEl.querySelectorAll('button[data-add-link]').forEach(btn => {
                btn.addEventListener('click', (e)=>{
                    e.preventDefault();
                    const ci = parseInt(btn.getAttribute('data-add-link'), 10);
                    if (!Array.isArray(svc.characteristics[ci].link)) svc.characteristics[ci].link = [];
                    const baseFields = makeLinkFields();
                    const init = { type: '' };
                    baseFields.forEach(f => { init[f] = ''; });
                    svc.characteristics[ci].link.push(init);
                    saveState();
                    renderCharacteristicsForms();
                });
            });
            bodyEl.querySelectorAll('button[data-remove-link]').forEach(btn => {
                btn.addEventListener('click', (e)=>{
                    e.preventDefault();
                    const ci = parseInt(btn.getAttribute('data-char'), 10);
                    const li = parseInt(btn.getAttribute('data-remove-link'), 10);
                    if (Array.isArray(svc.characteristics[ci].link)) svc.characteristics[ci].link.splice(li,1);
                    saveState();
                    renderCharacteristicsForms();
                });
            });
            bodyEl.querySelectorAll('input[data-charp], input[type="checkbox"][data-charp]').forEach(inp=>{
                const handler = ()=>{
                    const ci = parseInt(inp.getAttribute('data-charp'), 10);
                    const prop = inp.getAttribute('data-prop');
                    let val = inp.type==='checkbox' ? inp.checked : inp.value;
                    if (inp.type==='number') val = inp.value === '' ? undefined : parseFloat(inp.value);
                    const defAttr = inp.getAttribute('data-default');
                    // если значение совпадает с дефолтным (или пустое), не сохраняем поле
                    if (inp.type==='checkbox') {
                        const defVal = defAttr === 'true';
                        if (val === defVal) delete svc.characteristics[ci][prop]; else svc.characteristics[ci][prop] = val;
                    } else if (inp.type==='number') {
                        const defVal = defAttr === '' ? undefined : parseFloat(defAttr);
                        if ((typeof val === 'undefined' && typeof defVal === 'undefined') || val === defVal) delete svc.characteristics[ci][prop]; else svc.characteristics[ci][prop] = val;
                    } else {
                        if ((val==='' && (defAttr==='' || typeof defAttr==='undefined')) || val === defAttr) delete svc.characteristics[ci][prop]; else svc.characteristics[ci][prop] = val;
                    }
                    saveState();
                };
                inp.addEventListener('input', handler);
                inp.addEventListener('change', handler);
            });
            bodyEl.querySelectorAll('input[data-charvv]').forEach(cb=>{
                cb.addEventListener('change', ()=>{
                    const ci = parseInt(cb.getAttribute('data-charvv'),10);
                    const vv = cb.getAttribute('data-vv');
                    const set = new Set((svc.characteristics[ci].validValues||'').split(',').map(s=>s.trim()).filter(Boolean));
                    if (cb.checked) set.add(vv); else set.delete(vv);
                    svc.characteristics[ci].validValues = Array.from(set).join(',');
                    saveState();
                });
            });
            // Управление кнопками в зависимости от режима
            if (externalMode === 'addService') {
                doneBtn.style.display = 'none';
                nextBtn.style.display = '';
                nextBtn.textContent = 'Готово';
                nextBtn.onclick = () => { finishExternal((state.template.services || []).map(s => JSON.parse(JSON.stringify(s)))); };
            } else if (externalMode === 'addCharacteristics') {
                nextBtn.style.display = 'none';
                doneBtn.style.display = '';
                doneBtn.onclick = () => { const svcCopy = JSON.parse(JSON.stringify(svc)); finishExternal(svcCopy.characteristics || []); };
            } else if (externalMode === 'addLink') {
                nextBtn.style.display = 'none';
                doneBtn.style.display = '';
                doneBtn.onclick = () => {
                    const ch = (svc.characteristics || [])[0] || { link: [] };
                    finishExternal(JSON.parse(JSON.stringify(ch.link || [])));
                };
            } else {
                nextBtn.onclick = () => {
                    // Следующий сервис или к опциям
                    if (state.serviceIdx < state.template.services.length - 1) {
                        state.serviceIdx += 1; state.step = 2; saveState(); scrollWizardTop(); render();
                    } else {
                        state.step = 5; saveState(); scrollWizardTop(); render();
                    }
                };
            }
            // В режиме добавления линка рисуем отдельный мастер без шага назад к выбору характеристик
            if (externalMode === 'addLink') {
                prevBtn.style.display = 'none';
            } else {
                prevBtn.onclick = () => { state.step = 3; saveState(); render(); };
            }
        }

        // Упрощённый экран редактирования только Link для внешнего режима добавления линка
        function renderCharacteristicLinkWizard() {
            const svc = state.template.services[state.serviceIdx];
            const ch = (svc.characteristics || [])[0] || { type: '', link: [] };
            const svcDef = (window.shTypes||[]).find(s=>s.type===svc.type);
            const charType = ch.type;
            const controller = document.getElementById('controllerSelect')?.value || state.controller;
            const ctrlFields = (window.controllerLinkFields && controller) ? window.controllerLinkFields[controller] : null;
            const required = ctrlFields ? (ctrlFields.required || []) : [];
            const readField = ctrlFields ? ctrlFields.read : null;
            const writeField = ctrlFields ? ctrlFields.write : null;
            const linkTypeEnum = (window.schema && window.schema.$defs && window.schema.$defs.link && window.schema.$defs.link.properties && window.schema.$defs.link.properties.type && window.schema.$defs.link.properties.type.enum) ? window.schema.$defs.link.properties.type.enum : [];
            titleEl.textContent = `Link для ${charType}`;
            if (!Array.isArray(ch.link) || ch.link.length === 0) {
                const init = { type: '' };
                const base = new Set(required);
                if (readField) base.add(readField);
                if (writeField) base.add(writeField);
                Array.from(base).forEach(f => { init[f] = ''; });
                ch.link = [init];
            }
            const blocks = ch.link.map((lnk, li) => {
                const allFields = new Set(Object.keys(lnk).filter(k=>k!=='type' && k!=='map' && k!=='outMap'));
                required.forEach(f=>allFields.add(f));
                if (readField) allFields.add(readField);
                if (writeField) allFields.add(writeField);
                allFields.add('inFunc');
                allFields.add('outFunc');
                const typeSel = `<div class='kv-row'><label style='min-width:160px;'>type${tipByKey('link.type')}</label>
                        <select data-char='0' data-link='${li}' data-field='type'>
                            <option value=''></option>
                            ${linkTypeEnum.map(t=>`<option value='${t}' ${lnk.type===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                        <button class='remove-btn remove-link-btn' data-char='0' data-remove-link='${li}'>✕</button>
                    </div>`;
                const rows = Array.from(allFields).map(f=>{
                    const v = lnk[f] ?? '';
                    const help = (f === 'map' || f === 'outMap' || f === 'inFunc' || f === 'outFunc' || f === 'scale') ? tipByKey(`link.${f}`) : tipForLinkField(f);
                    return `<div class='kv-row'><label style='min-width:160px;'>${f}${help}</label><input type='text' data-char='0' data-link='${li}' data-field='${f}' value='${v}' /></div>`;
                }).join('');
                return `<div class='service-block link-block'><div class='link-title'>Линк ${li+1}</div>${typeSel}${rows}</div>`;
            }).join('');
            const addBtn = `<div style='margin:8px 0;'><button class='toolbar-btn' data-add-link='0'>Добавить линк</button></div>`;
            bodyEl.innerHTML = `<div class='section-title'>Link${tipByKey('link.section')}</div>${blocks}${addBtn}`;
            // бинды
            bodyEl.querySelectorAll('input[data-char], select[data-char]').forEach(inp => {
                inp.addEventListener('input', () => {
                    const li = parseInt(inp.getAttribute('data-link'),10) || 0;
                    const field = inp.getAttribute('data-field');
                    if (!Array.isArray(ch.link)) ch.link = [];
                    if (!ch.link[li]) ch.link[li] = {};
                    ch.link[li][field] = inp.value;
                    saveState();
                });
            });
            bodyEl.querySelectorAll('button[data-add-link]').forEach(btn => {
                btn.addEventListener('click', (e)=>{
                    e.preventDefault();
                    if (!Array.isArray(ch.link)) ch.link = [];
                    const init = { type: '' };
                    const base = new Set(required); if (readField) base.add(readField); if (writeField) base.add(writeField);
                    Array.from(base).forEach(f => { init[f] = ''; });
                    ch.link.push(init);
                    saveState();
                    renderCharacteristicLinkWizard();
                });
            });
            bodyEl.querySelectorAll('button.remove-link-btn').forEach(btn => {
                btn.addEventListener('click', (e)=>{
                    e.preventDefault();
                    const li = parseInt(btn.getAttribute('data-remove-link'),10)||0;
                    ch.link.splice(li,1);
                    saveState();
                    renderCharacteristicLinkWizard();
                });
            });
            // управление кнопками: в addLink нет Next, есть Done
            nextBtn.style.display = 'none';
            doneBtn.style.display = '';
            doneBtn.onclick = () => {
                finishExternal(JSON.parse(JSON.stringify(ch.link || [])));
            };
        }

        function renderOptionsStep() {
            titleEl.textContent = 'Опции';
            const opts = state.template.options || [];
            const list = opts.map((o, i) => `<div class='option-block'><div class='section-title'>${o.name||'(без имени)'} (${o.inputType||''})</div></div>`).join('');
            bodyEl.innerHTML = `
                <div>${list}</div>
                <div style='margin-top:10px;'><button id='w_add_option' class='toolbar-btn'>Добавить опцию</button></div>
            `;
            const addBtn = document.getElementById('w_add_option');
            addBtn.onclick = () => renderOptionWizard();
            nextBtn.style.display = 'none';
            doneBtn.style.display = '';
            doneBtn.onclick = () => {
                // Готово: вывести шаблон в редактор
                const finalTemplate = JSON.parse(JSON.stringify(state.template));
                // Автоконверсия типов для map/outMap
                const convertValue = (s) => {
                    if (s === 'true') return true;
                    if (s === 'false') return false;
                    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
                    return s;
                };
                (finalTemplate.services||[]).forEach(svc => {
                    (svc.characteristics||[]).forEach(ch => {
                        if (Array.isArray(ch.link)) {
                            ch.link.forEach(lnk => {
                                // Удаляем пустой scale, чтобы не попадал в итоговый шаблон
                                if (lnk && (lnk.scale === '' || typeof lnk.scale === 'undefined')) {
                                    delete lnk.scale;
                                }
                                ['map','outMap'].forEach(g => {
                                    if (lnk && lnk[g]) {
                                        const obj = {};
                                        Object.entries(lnk[g]).forEach(([k,v])=>{ obj[k] = convertValue(String(v)); });
                                        lnk[g] = obj;
                                    }
                                });
                            });
                        }
                    });
                });
                (finalTemplate.options||[]).forEach(opt => {
                    if (Array.isArray(opt.link)) {
                        opt.link.forEach(lnk => {
                            if (lnk && (lnk.scale === '' || typeof lnk.scale === 'undefined')) {
                                delete lnk.scale;
                            }
                            ['map','outMap'].forEach(g => {
                                if (lnk && lnk[g]) {
                                    const obj = {};
                                    Object.entries(lnk[g]).forEach(([k,v])=>{ obj[k] = convertValue(String(v)); });
                                    lnk[g] = obj;
                                }
                            });
                        });
                    }
                });
                window.editor.setValue(JSON.stringify(finalTemplate, null, 2));
                window.editor.refresh();
                // Очистка прогресса
                try { localStorage.removeItem(LS_KEY); } catch {}
                resetState();
                close();
                window.showToast('Шаблон создан', 'success');
            };
            prevBtn.onclick = () => {
                state.step = 4; // вернуться к последнему сервису
                state.serviceIdx = state.template.services.length - 1;
                saveState(); render();
            };
        }

        function renderOptionWizard() {
            titleEl.textContent = 'Новая опция';
            const types = window.allowedInputTypesFromSchema || [];
            const opt = { name: '', inputType: (types[0]||''), link: [{}] };
            // Единый шаг: выбор inputType+name и Link
            bodyEl.innerHTML = `
                <div style='font-size:13px; opacity:.85; margin: -4px 0 8px 0;'>${escapeTipText(FIELD_TIPS['options.note'])}</div>
                <div class='form-row'><label>Имя (name)${tipByKey('option.name')}</label><input id='w_opt_name2' type='text' value='${opt.name}'/></div>
                <div class='form-row'><label>Тип опции (inputType)${tipByKey('option.inputType')}</label>
                    <select id='w_opt_type2'>${types.map(t=>`<option value='${t}' ${opt.inputType===t?'selected':''}>${t}</option>`).join('')}</select>
                </div>
                <div class='section-title'>Link${tipByKey('link.section')}</div>
                <div id='w_opt_links'></div>
                <div style='margin:8px 0;'><button class='toolbar-btn' id='w_opt_add_link'>Добавить линк</button></div>
            `;
            function renderLinkBlocks() {
                const controller = document.getElementById('controllerSelect')?.value || state.controller;
                const ctrlFields = (window.controllerLinkFields && controller) ? window.controllerLinkFields[controller] : null;
                const required = ctrlFields ? (ctrlFields.required || []) : [];
                const readField = ctrlFields ? ctrlFields.read : null;
                const writeField = ctrlFields ? ctrlFields.write : null;
                const linkTypeEnum = (window.schema && window.schema.$defs && window.schema.$defs.link && window.schema.$defs.link.properties && window.schema.$defs.link.properties.type && window.schema.$defs.link.properties.type.enum) ? window.schema.$defs.link.properties.type.enum : [];
                const fields = new Set(required);
                if (readField) fields.add(readField);
                if (writeField) fields.add(writeField);
                const cont = document.getElementById('w_opt_links');
                cont.innerHTML = (opt.link||[]).map((lnk, li)=>{
                    // Инициализируем отсутствующие базовые поля пустыми строками, чтобы они попали в итоговый JSON
                    if (typeof lnk.type === 'undefined') lnk.type = '';
                    Array.from(fields).forEach(f => { if (typeof lnk[f] === 'undefined') lnk[f] = ''; });
                    // те же элементы, что и у характеристики: type, поля, map/outMap, заголовок
                    const allFields = new Set(Object.keys(lnk).filter(k=>k!=='type' && k!=='map' && k!=='outMap'));
                    fields.forEach(f=>allFields.add(f));
                    allFields.add('inFunc');
                    allFields.add('outFunc');
                    allFields.add('link');
                    let rows = Array.from(allFields).map(f => {
                        const help = (f === 'map' || f === 'outMap' || f === 'inFunc' || f === 'outFunc') ? tipByKey(`link.${f}`) : tipForLinkField(f);
                        return `<div class='kv-row'><label style='min-width:160px;'>${f}${help}</label><input type='text' data-optlink='${li}' data-field='${f}' value='${lnk[f]||''}' /></div>`;
                    }).join('');
                    const renderPairs = (pairs, group) => {
                        const entries = Object.entries(pairs||{});
                        const list = entries.map(([k, val], pi)=>
                            `<div class='kv-row'><label style='min-width:160px;'>${group}[${pi}]${tipByKey(`link.${group}`)}</label><input type='text' data-optlink='${li}' data-${group}-key='${pi}' value='${k}' />
                             <input type='text' data-optlink='${li}' data-${group}-val='${pi}' value='${val}' />
                             <button class='remove-btn' data-optlink='${li}' data-remove-${group}='${pi}'>−</button></div>`
                        ).join('');
                        const addLabel = entries.length ? 'Добавить поле' : `Добавить ${group}`;
                        const add = `<div class='kv-row'><button class='toolbar-btn' data-optlink='${li}' data-add-${group}='1'>${addLabel}</button></div>`;
                        return `<div class='section-title'>${group}${tipByKey(`link.${group}`)}</div>${list}${add}`;
                    };
                    rows += renderPairs(lnk.map, 'map');
                    rows += renderPairs(lnk.outMap, 'outMap');
                    const typeSel = `<div class='kv-row'><label style='min-width:160px;'>type${tipByKey('link.type')}</label>
                        <select data-optlink='${li}' data-field='type'>
                            <option value=''></option>
                            ${linkTypeEnum.map(t=>`<option value='${t}' ${lnk.type===t?'selected':''}>${t}</option>`).join('')}
                        </select>
                        <button class='remove-btn remove-link-btn' data-remove-link='${li}'>✕</button>
                    </div>`;
                    return `<div class='service-block link-block'><div class='link-title'>Линк ${li+1}</div>${typeSel}${rows}</div>`;
                }).join('') || `<div class='service-block link-block'>Нет линков</div>`;
                // bind
                cont.querySelectorAll('input[data-field], select[data-field]').forEach(inp => {
                    inp.addEventListener('input', () => {
                        const li = parseInt(inp.getAttribute('data-optlink'),10) || 0;
                        if (!Array.isArray(opt.link)) opt.link = [];
                        if (!opt.link[li]) opt.link[li] = {};
                        opt.link[li][inp.getAttribute('data-field')] = inp.value;
                    });
                });
                // обработка удаления map/outMap элементов
                cont.querySelectorAll('button[data-remove-map], button[data-remove-outMap]').forEach(btn => {
                    btn.addEventListener('click',(e)=>{
                        e.preventDefault();
                        const li = parseInt(btn.getAttribute('data-optlink'),10);
                        const isOut = btn.hasAttribute('data-remove-outMap');
                        const idx = parseInt(btn.getAttribute(isOut?'data-remove-outMap':'data-remove-map'),10);
                        const link = (opt.link||[])[li] || {};
                        const group = isOut ? 'outMap':'map';
                        const entries = Object.entries(link[group]||{});
                        if (entries[idx]) {
                            const k = entries[idx][0];
                            delete link[group][k];
                        }
                        renderLinkBlocks();
                    });
                });
                // обработка изменений map/outMap ключ/значение
                cont.querySelectorAll('input[data-map-key], input[data-map-val], input[data-outMap-key], input[data-outMap-val]').forEach(inp=>{
                    inp.addEventListener('input',()=>{
                        const li = parseInt(inp.getAttribute('data-optlink'),10);
                        if (!Array.isArray(opt.link)) opt.link = [];
                        if (!opt.link[li]) opt.link[li] = {};
                        const isOut = inp.hasAttribute('data-outMap-key') || inp.hasAttribute('data-outMap-val');
                        const isKey = inp.hasAttribute('data-map-key') || inp.hasAttribute('data-outMap-key');
                        const idx = parseInt(inp.getAttribute(isOut? (isKey?'data-outMap-key':'data-outMap-val') : (isKey?'data-map-key':'data-map-val')),10);
                        const group = isOut ? 'outMap':'map';
                        if (!opt.link[li][group]) opt.link[li][group] = {};
                        const entries = Object.entries(opt.link[li][group]);
                        const current = entries[idx] || ['', ''];
                        const newKey = isKey ? inp.value : current[0];
                        const newValRaw = isKey ? current[1] : inp.value;
                        if (current[0] && newKey !== current[0]) delete opt.link[li][group][current[0]];
                        opt.link[li][group][newKey] = newValRaw;
                    });
                });
                // добавление пары map/outMap
                cont.querySelectorAll('button[data-add-map], button[data-add-outMap]').forEach(btn=>{
                    btn.addEventListener('click',(e)=>{
                        e.preventDefault();
                        const li = parseInt(btn.getAttribute('data-optlink'),10);
                        const isOut = btn.hasAttribute('data-add-outMap');
                        const group = isOut ? 'outMap' : 'map';
                        if (!Array.isArray(opt.link)) opt.link = [];
                        if (!opt.link[li]) opt.link[li] = {};
                        if (!opt.link[li][group]) opt.link[li][group] = {};
                        let i = 0; let key = 'KEY';
                        while (Object.prototype.hasOwnProperty.call(opt.link[li][group], key + (i||''))) i++;
                        opt.link[li][group][key + (i||'')] = '';
                        renderLinkBlocks();
                    });
                });
                // удаление произвольного поля (не map/outMap)
                cont.querySelectorAll('button[data-remove-field]').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        const f = btn.getAttribute('data-remove-field');
                        const li = parseInt(btn.getAttribute('data-optlink'),10)||0;
                        if (Array.isArray(opt.link) && opt.link[li]) delete opt.link[li][f];
                        renderLinkBlocks();
                    });
                });
                cont.querySelectorAll('button[data-remove-link]').forEach(btn => {
                    btn.addEventListener('click', (e)=>{
                        e.preventDefault();
                        const li = parseInt(btn.getAttribute('data-remove-link'),10)||0;
                        if (Array.isArray(opt.link)) opt.link.splice(li,1);
                        renderLinkBlocks();
                    });
                });
            }
            renderLinkBlocks();
            document.getElementById('w_opt_add_link').onclick = ()=>{ if(!Array.isArray(opt.link)) opt.link=[]; const init={type:''}; opt.link.push(init); renderLinkBlocks(); };
            nextBtn.style.display = 'none';
            doneBtn.style.display = '';
            if (externalMode === 'addOption') {
                doneBtn.onclick = () => {
                    opt.name = document.getElementById('w_opt_name2').value.trim();
                    opt.inputType = document.getElementById('w_opt_type2').value;
                    finishExternal(JSON.parse(JSON.stringify(opt)));
                };
            } else {
                doneBtn.onclick = () => {
                    opt.name = document.getElementById('w_opt_name2').value.trim();
                    opt.inputType = document.getElementById('w_opt_type2').value;
                    state.template.options = state.template.options || [];
                    state.template.options.push(opt);
                    saveState();
                    renderOptionsStep();
                };
            }
            // В режиме добавления опции через кнопку — скрываем «Назад» и верхнюю кнопку назад на стартовом шаге
            if (externalMode === 'addOption') {
                prevBtn.style.display = 'none';
            } else {
                prevBtn.onclick = () => { renderOptionsStep(); };
            }
        }

        function renderOptionParams(opt) {
            titleEl.textContent = 'Параметры опции и Link';
            const controller = document.getElementById('controllerSelect')?.value || state.controller;
            const ctrlFields = (window.controllerLinkFields && controller) ? window.controllerLinkFields[controller] : null;
            const required = ctrlFields ? (ctrlFields.required || []) : [];
            const readField = ctrlFields ? ctrlFields.read : null;
            const writeField = ctrlFields ? ctrlFields.write : null;
            const linkTypeEnum = (window.schema && window.schema.$defs && window.schema.$defs.link && window.schema.$defs.link.properties && window.schema.$defs.link.properties.type && window.schema.$defs.link.properties.type.enum) ? window.schema.$defs.link.properties.type.enum : [];
            const fields = new Set(required);
            if (readField) fields.add(readField);
            if (writeField) fields.add(writeField);
            const linkBlocks = (Array.isArray(opt.link)?opt.link:[]).map((lnk, li)=>{
                // Проставить базовые поля пустыми, чтобы попали в JSON, даже если пользователь не менял
                if (typeof lnk.type === 'undefined') lnk.type = '';
                Array.from(fields).forEach(f => { if (typeof lnk[f] === 'undefined') lnk[f] = ''; });
                const typeSel = `<div class='kv-row'><label style='min-width:160px;'>type</label>
                    <select data-optlink='${li}' data-field='type'>
                        <option value=''></option>
                        ${linkTypeEnum.map(t=>`<option value='${t}' ${lnk.type===t?'selected':''}>${t}</option>`).join('')}
                    </select>
                    <button class='remove-btn' data-remove-link='${li}'>Удалить линк</button>
                </div>`;
                const rows = Array.from(fields).map(f => `<div class='kv-row'><label style='min-width:160px;'>${f}</label><input type='text' data-optlink='${li}' data-field='${f}' value='${lnk[f]||''}' /><button class='remove-btn' data-remove-field='${f}' data-optlink='${li}'>−</button></div>`).join('');
                return `<div class='service-block'>${typeSel}${rows}</div>`;
            }).join('');
            const addLinkBtn = `<div style='margin:8px 0;'><button class='toolbar-btn' id='w_opt_add_link'>Добавить линк</button></div>`;
            const body = `
                <div style='font-size:13px; opacity:.85; margin: -4px 0 8px 0;'>${escapeTipText(FIELD_TIPS['options.note'])}</div>
                <div class='form-row'><label>Имя (name)${tipByKey('option.name')}</label><input id='w_opt_name2' type='text' value='${opt.name||''}'/></div>
                <div class='form-row is-disabled'><label>Тип опции (inputType)${tipByKey('option.inputType')}</label><input id='w_opt_type2' type='text' value='${opt.inputType||''}' disabled/></div>
                <div class='section-title'>Link${tipByKey('link.section')}</div>
                ${linkBlocks || '<div class="service-block">Нет линков</div>'}
                ${addLinkBtn}
            `;
            bodyEl.innerHTML = body;
            bodyEl.querySelectorAll('input[data-field], select[data-field]').forEach(inp => {
                inp.addEventListener('input', () => {
                    const li = parseInt(inp.getAttribute('data-optlink'),10) || 0;
                    if (!Array.isArray(opt.link)) opt.link = [];
                    if (!opt.link[li]) opt.link[li] = {};
                    opt.link[li][inp.getAttribute('data-field')] = inp.value;
                });
            });
            const addBtn = document.getElementById('w_opt_add_link');
            if (addBtn) addBtn.onclick = ()=>{ if(!Array.isArray(opt.link)) opt.link=[]; opt.link.push({}); renderOptionParams(opt); };
            bodyEl.querySelectorAll('button[data-remove-field]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const f = btn.getAttribute('data-remove-field');
                    const li = parseInt(btn.getAttribute('data-optlink'),10)||0;
                    if (Array.isArray(opt.link) && opt.link[li]) delete opt.link[li][f];
                    renderOptionParams(opt);
                });
            });
            bodyEl.querySelectorAll('button[data-remove-link]').forEach(btn => {
                btn.addEventListener('click', (e)=>{
                    e.preventDefault();
                    const li = parseInt(btn.getAttribute('data-remove-link'),10)||0;
                    if (Array.isArray(opt.link)) opt.link.splice(li,1);
                    renderOptionParams(opt);
                });
            });
            nextBtn.style.display = 'none';
            doneBtn.style.display = '';
            doneBtn.onclick = () => {
                opt.name = document.getElementById('w_opt_name2').value.trim();
                // type у опции оставляем пустым; inputType выбран ранее
                state.template.options = state.template.options || [];
                state.template.options.push(opt);
                saveState();
                renderOptionsStep();
            };
            prevBtn.onclick = () => { renderOptionsStep(); };
        }

        // Навигация/закрытие
        function confirmCloseWizard() {
            const ok = window.confirm('Закрыть мастер создания шаблона?');
            if (ok) {
                try { localStorage.removeItem(LS_KEY); } catch {}
                resetState();
                close();
            }
        }
        backBtn.onclick = () => {
            // Навигация: предыдущий шаг
            if (state.step > 0) {
                if (state.step === 3) state.step = 2; // из выбора характеристик к форме сервиса
                else if (state.step === 2) state.step = 1; // форма сервиса -> список сервисов
                else if (state.step === 4) state.step = 3; // формы характеристик -> выбор характеристик
                else if (state.step === 5) { state.step = 4; state.serviceIdx = state.template.services.length - 1; }
                else state.step = Math.max(0, state.step - 1);
                saveState();
                render();
            } else {
                // На шаге "Данные шаблона" (step 0) показываем выбор контроллера вместо закрытия
                if (typeof window.showControllerSelectDialog === 'function') {
                    // Перед открытием выбора контроллера прячем текущий мастер, а после закрытия — показываем снова
                    const reopenWizard = () => { try { render(); open(); } catch(e){} };
                    close();
                    window.showControllerSelectDialog(function(controllerValue){
                        if (!controllerValue) return;
                        try {
                            setControllerSelect(controllerValue);
                        } catch(e){}
                        state.controller = controllerValue;
                        saveState();
                        // после выбора — снова открыть мастер на том же шаге
                        reopenWizard();
                    }, false, reopenWizard);
                } else {
                    confirmCloseWizard();
                }
            }
        };
        closeBtn.onclick = () => { confirmCloseWizard(); };
        dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) confirmCloseWizard(); });
    })();

    // Горячая клавиша на скачивание: Ctrl/Cmd+S
    window.editor.addKeyMap({
        'Ctrl-S': function(cm) { try { window.downloadTemplate(); } catch(e){} },
        'Cmd-S': function(cm) { try { window.downloadTemplate(); } catch(e){} }
    });

    // Валидация при изменении (с дебаунсом)
    const validateDebounced = window.debounce(() => {
        try { window.validateJson(true); } catch(e){}
    }, 400);
    window.editor.on('change', validateDebounced);

}); // <-- Закрываю window.addEventListener('DOMContentLoaded', function() { ... });