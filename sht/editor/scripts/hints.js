// hints.js
// Helpers for CodeMirror 6 autocomplete: context detection, suggestion building and ordering

export function computeContext(cm) {
    const cur = cm.getCursor();
    const lineText = cm.getLine(cur.line) || '';
    const token = cm.getTokenAt(cur);

    let keyStart = cur.ch;
    let keyEnd = cur.ch;
    let currentWord = '';

    if (token && token.string && token.type === 'string') {
        currentWord = token.string.replace(/^"|"$/g, '');
        keyStart = token.start;
        keyEnd = token.end;
    } else {
        const before = lineText.slice(0, cur.ch);
        const after = lineText.slice(cur.ch);
        const m1 = before.match(/(["']?[\w$]+["']?)$/);
        if (m1) {
            currentWord = m1[1].replace(/^["']|["']$/g, '');
            keyStart = cur.ch - m1[1].length;
        } else {
            currentWord = '';
            keyStart = cur.ch;
        }
        const m2 = after.match(/^[\w$]*/);
        keyEnd = cur.ch + (m2 ? m2[0].length : 0);
    }

    const before = lineText.slice(0, cur.ch);
    const after = lineText.slice(cur.ch);
    const inValue = (() => {
        if (token && token.type === 'string') {
            if (/\:\s*"/.test(before)) return true;
            return false;
        }
        if (/\:\s*$/.test(before)) return true;
        if (/\:\s+\S/.test(before) && !/\:\s*"/.test(before)) return true;
        if (/\:\s*[^"'\s]/.test(before)) return true;
        return false;
    })();

    const insideObject = (() => {
        const openB = (before.match(/\{/g) || []).length + (after.match(/\{/g) || []).length;
        const closeB = (before.match(/\}/g) || []).length + (after.match(/\}/g) || []).length;
        return openB > closeB;
    })();

    return { cur, token, lineText, before, after, keyStart, keyEnd, currentWord, inValue, insideObject };
}

export function orderAndFilter(list, currentWord) {
    const q = (currentWord || '').toLowerCase();
    if (!q) return list;
    const starts = [];
    const contains = [];
    const rest = [];
    for (const it of list) {
        const label = String(it.displayText || it.text || '').toLowerCase();
        if (label.startsWith(q)) starts.push(it);
        else if (label.includes(q)) contains.push(it);
        else rest.push(it);
    }
    return [...starts, ...contains, ...rest];
}

export function buildSuggestions(cm, schemaNode, path, schema) {
    const ctx = computeContext(cm);
    const { cur, keyStart, keyEnd, currentWord, inValue, insideObject, lineText, before, after } = ctx;

    // Do not open/keep list at EOL after comma or closing brackets
    if (/(,|\}|\])\s*$/.test(before) && /^\s*$/.test(after)) {
        return { list: [], fromCh: keyStart, toCh: keyEnd };
    }

    const makeReplace = (text) => ({
        text,
        displayText: String(text).replace(/^"|"$/g, ''),
        hint: function (cmShim) {
            cmShim.replaceRange(text, { line: cur.line, ch: keyStart }, { line: cur.line, ch: keyEnd });
        }
    });

    const list = [];

    // Resolve key name for value context using text before cursor
    const keyForValue = (() => {
        const m = before.match(/\"([^\"]+)\"\s*:\s*[^:]*$/);
        return m ? m[1] : null;
    })();

    // Values mode
    if (inValue) {
        const key = keyForValue || (path.length > 0 ? path[path.length - 1] : null);
        const field = key && schemaNode && schemaNode[key] ? schemaNode[key] : null;
        if (field) {
            if (Array.isArray(field.enum) && field.enum.length) {
                list.push(...field.enum.map(v => makeReplace(`"${v}"`)));
            } else if (field.type === 'boolean') {
                list.push(makeReplace('true'));
                list.push(makeReplace('false'));
            } else if (field.type === 'string') {
                list.push(makeReplace('""'));
            } else if (field.type === 'array') {
                list.push(makeReplace('[]'));
            } else if (field.type === 'object') {
                list.push(makeReplace('{}'));
            }
        }
    } else {
        // Keys mode
        if (schemaNode) {
            Object.keys(schemaNode).forEach(k => {
                const def = schemaNode[k];
                list.push({
                    text: k,
                    displayText: def && def.type ? `${k} (${def.type})` : k,
                    render: function (el) {
                        el.innerHTML = `<span style='font-weight:bold'>${k}</span> <span style='color:#888'>${def && def.type ? def.type : ''}</span>`;
                    },
                    hint: function (cmShim) {
                        cmShim.replaceRange('"' + k + '": ', { line: cur.line, ch: keyStart }, { line: cur.line, ch: keyEnd });
                    }
                });
            });
        }
        // Structural helpers when user typed exact field name
        const m = lineText.slice(0, cur.ch).match(/"([^"]*)"\s*$/);
        const exactKey = m ? m[1] : null;
        if (exactKey && schemaNode && schemaNode[exactKey]) {
            const def = schemaNode[exactKey];
            if (def.type === 'array') list.unshift(makeReplace('[]'));
            if (def.type === 'object') list.unshift(makeReplace('{}'));
        }
    }

    const finalList = orderAndFilter(list, currentWord);
    return { list: finalList, fromCh: keyStart, toCh: keyEnd };
}

// Legacy-compatible wrappers so editor.js can import them
export function getCurrentJsonPath(cm) {
    try {
        // Reuse the same logic as before but simplified via computeContext if needed.
        // Here we call back into existing global if present, else minimal path.
        if (typeof window !== 'undefined' && typeof window.getCurrentJsonPath === 'function') {
            try { return window.getCurrentJsonPath(cm); } catch {}
        }
        return [];
    } catch { return []; }
}

export function getHintsForPathImproved(path, tree) {
    try {
        let node = tree || {};
        if (!path || !Array.isArray(path)) return node;
        for (let i = 0; i < path.length; i++) {
            const seg = path[i];
            if (typeof seg === 'number') continue;
            if (!node || typeof node !== 'object') break;
            const field = node[seg];
            if (!field) break;
            node = field && field.properties ? field.properties : node;
        }
        return node || (tree || {});
    } catch {
        return tree || {};
    }
}

export function customJsonHint(cm) {
    if (typeof window !== 'undefined' && typeof window.customJsonHint === 'function') {
        try { return window.customJsonHint(cm); } catch {}
    }
    const path = getCurrentJsonPath(cm) || [];
    const node = getHintsForPathImproved(path, (typeof window !== 'undefined' ? window.schemaHintsTree : null));
    const built = buildSuggestions(cm, node, path, (typeof window !== 'undefined' ? window.schema : null));
    const cur = cm.getCursor();
    return {
        list: built.list,
        from: { line: cur.line, ch: built.fromCh },
        to: { line: cur.line, ch: built.toCh },
        completeSingle: false
    };
}

