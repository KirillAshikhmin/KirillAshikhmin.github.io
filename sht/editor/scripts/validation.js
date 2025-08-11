// validation.js
// Модуль для валидации, подсветки ошибок и автокоррекции JSON
// Глобальные функции для использования в index.html и других js-файлах

window.highlightErrorLine = function(path, jsonStr) {
    if (!path) return 1;
    const lines = jsonStr.split('\n');
    const segments = path.replace(/^\./, '').split(/\.|\[(\d+)\]/).filter(p => p && p.trim() !== '');
    let searchScope = jsonStr;
    let totalOffsetChars = 0;
    for (const segment of segments) {
        const isArrayIndex = /^\d+$/.test(segment);
        if (isArrayIndex) {
            const index = parseInt(segment, 10);
            const arrayStartMatch = /^\s*\[/.exec(searchScope);
            if (!arrayStartMatch) return -1;
            let searchFrom = arrayStartMatch[0].length;
            let elementCount = 0;
            let elementStart = -1;
            while (elementCount <= index) {
                let inString = false;
                let braceDepth = 0;
                let bracketDepth = 0;
                let foundStart = false;
                for (let i = searchFrom; i < searchScope.length; i++) {
                    if (!foundStart) {
                        if (/\s|,/.test(searchScope[i])) continue;
                        elementStart = i;
                        foundStart = true;
                    }
                    const char = searchScope[i];
                    const prevChar = i > 0 ? searchScope[i - 1] : null;
                    if (char === '"' && prevChar !== '\\') inString = !inString;
                    if (!inString) {
                        if (char === '{') braceDepth++;
                        else if (char === '}') braceDepth--;
                        else if (char === '[') bracketDepth++;
                        else if (char === ']') bracketDepth--;
                        if (braceDepth === 0 && bracketDepth === 0 && (char === ',' || i === searchScope.length - 1)) {
                            if (elementCount === index) {
                                totalOffsetChars += elementStart;
                                searchScope = searchScope.substring(elementStart, i + 1);
                            }
                            searchFrom = i + 1;
                            break;
                        }
                        if ((braceDepth === -1 || bracketDepth === -1)) {
                            if (elementCount === index) {
                                totalOffsetChars += elementStart;
                                searchScope = searchScope.substring(elementStart, i);
                            }
                            searchFrom = i;
                            break;
                        }
                    }
                    if (i === searchScope.length - 1) {
                        if (elementCount === index) {
                            totalOffsetChars += elementStart;
                            searchScope = searchScope.substring(elementStart);
                        }
                        searchFrom = i + 1;
                    }
                }
                elementCount++;
            }
        } else {
            const keyRegex = new RegExp(`"${segment}"\\s*:`);
            const match = keyRegex.exec(searchScope);
            if (!match) return -1;
            totalOffsetChars += match.index + match[0].length;
            searchScope = searchScope.substring(match.index + match[0].length);
        }
    }
    const lineNumber = jsonStr.substring(0, totalOffsetChars).split('\n').length;
    if (lineNumber > 0 && lineNumber <= lines.length) {
        window.editor.addLineClass(lineNumber - 1, 'background', 'error-line');
    }
    return lineNumber;
};

window.clearErrorHighlights = function() {
    for (let i = 0; i < window.editor.lineCount(); i++) {
        window.editor.removeLineClass(i, 'background', 'error-line');
    }
};

window.validateServiceAndCharacteristics = function(json, errors, warnings, jsonStr) {
    if (json.services && Array.isArray(json.services)) {
        json.services.forEach((service, serviceIndex) => {
            if (!service.type) {
                const line = window.highlightErrorLine(`services[${serviceIndex}]`, jsonStr);
                errors.push(`Сервис ${serviceIndex + 1}: Отсутствует поле type (строка ${line})`);
                return;
            }
            const serviceDef = window.shTypes.find(t => t.type === service.type);
            if (!serviceDef) {
                const line = window.highlightErrorLine(`services[${serviceIndex}].type`, jsonStr);
                errors.push(`Сервис ${service.type}: Тип сервиса не найден (строка ${line})`);
                return;
            }
            if (!service.characteristics || !Array.isArray(service.characteristics)) {
                const line = window.highlightErrorLine(`services[${serviceIndex}].characteristics`, jsonStr);
                errors.push(`Сервис ${service.type}: Отсутствует или некорректно поле characteristics (строка ${line})`);
                return;
            }
            service.characteristics.forEach((char, charIndex) => {
                if (!char.type) {
                    const line = window.highlightErrorLine(`services[${serviceIndex}].characteristics[${charIndex}]`, jsonStr);
                    errors.push(`Сервис ${service.type}, характеристика ${charIndex + 1}: Отсутствует поле type (строка ${line})`);
                    return;
                }
                const supportedCharacteristics = [
                    ...(serviceDef.required || []),
                    ...(serviceDef.optional || [])
                ];
                const charDef = supportedCharacteristics.find(c => c.type === char.type);
                if (!charDef) {
                    const line = window.highlightErrorLine(`services[${serviceIndex}].characteristics[${charIndex}].type`, jsonStr);
                    warnings.push(`Сервис ${service.type}: Характеристика ${char.type} не поддерживается (строка ${line})`);
                }
            });
        });
    }
};

window.translateAjvError = function(error, json, jsonStr) {
    // Используем instancePath (новый стандарт) или dataPath (для обратной совместимости)
    const path = error.instancePath || error.dataPath || '';
    const message = error.message;
    let translated = '';
    let contextPrefix = '';
    let highlightPath = path;
    
    // Преобразуем JSON Pointer в путь для подсветки
    const jsonPointerToPath = (pointer) => {
        // Делегируем утилите
        if (!pointer) return '';
        const segments = window.jsonPointerToSegments(pointer);
        let path = '';
        segments.forEach((seg, idx) => {
            if (/^\d+$/.test(seg)) path += `[${parseInt(seg, 10)}]`; else path += (idx === 0 ? '' : '.') + seg;
        });
        return path;
    };
    
    const pathForHighlight = jsonPointerToPath(path);
    const serviceMatch = pathForHighlight.match(/\.services\[(\d+)\]/);
    if (serviceMatch) {
        try {
            const serviceIndex = parseInt(serviceMatch[1], 10);
            const service = json.services[serviceIndex];
            if (service && service.name) {
                contextPrefix += `В сервисе "${service.name}"`;
            } else if (service && service.type) {
                contextPrefix += `В сервисе типа "${service.type}"`;
            }
            const charMatch = pathForHighlight.match(/\.characteristics\[(\d+)\]/);
            if (charMatch) {
                const charIndex = parseInt(charMatch[1], 10);
                const characteristic = json.services[serviceIndex].characteristics[charIndex];
                if (characteristic && characteristic.type) {
                    contextPrefix += `, характеристика "${characteristic.type}"`;
                }
                contextPrefix += ': ';
            } else {
                contextPrefix += ': ';
            }
        } catch(e) {
            contextPrefix = '';
        }
    }
            const line = window.highlightErrorLine(pathForHighlight, jsonStr);
    switch (error.keyword) {
        case 'additionalProperties':
            const extraProp = error.params.additionalProperty;
            translated = `Поле "${extraProp}" в ${path || 'корне объекта'} не разрешено по схеме (строка ${line})`;
            break;
        case 'required':
            translated = `В ${path || 'объекте'} отсутствует обязательное поле "${error.params.missingProperty}" (строка ${line})`;
            break;
        case 'type':
            translated = `Поле ${path} имеет неверный тип: ожидается ${error.params.type}, найдено ${typeof json[path.split('.').reduce((o, k) => o && o[k], json)]} (строка ${line})`;
            break;
        case 'enum':
            translated = `Поле ${path} имеет недопустимое значение. Допустимые значения: ${error.params.allowedValues.join(', ')} (строка ${line})`;
            break;
        case 'anyOf':
            translated = `Поле ${path} должно соответствовать одной из схем, определённых в JSON Schema (строка ${line})`;
            break;
        case 'dependencies':
            translated = `Поле ${path} должно содержать свойство ${error.params.missingProperty}, если присутствует ${error.params.property} (строка ${line})`;
            break;
        case 'propertyNames':
            const badName = (error.params && error.params.propertyName) ? error.params.propertyName : '';
            translated = `Недопустимое имя свойства "${badName}" в ${path || 'объекте'} (строка ${line})`;
            break;
        case 'pattern':
            // Читаем ожидаемый паттерн из сообщения/параметров
            const pattern = (error.params && error.params.pattern) ? error.params.pattern : (error.message || '').match(/\"([^\"]+)\"$/)?.[1] || '';
            translated = `${contextPrefix || 'Ошибка в '}${pathForHighlight || path}: должно соответствовать шаблону "${pattern}" (строка ${line})`;
            break;
        default:
            translated = `Ошибка в ${path}: ${message} (строка ${line})`;
    }
    return { message: translated, line };
};

window.autoFixJson = function(isManual = true) {
    try {
        document.getElementById('errorOutput').textContent = '';
        document.getElementById('autoFixContainer').innerHTML = '';
        if (isManual) {
            document.getElementById('correctionOutput').textContent = '';
        }
        let json = JSON.parse(window.editor.getValue());
        const corrections = [];
        const ajv = new Ajv({ allErrors: true, logger: false });
        const validate = ajv.compile(window.schema);
        validate(json);
        if (validate.errors) {
            validate.errors.forEach(error => {
                // Преобразуем JSON Pointer в сегменты
                const pointer = (error.instancePath || error.dataPath || '').replace(/^\//, '');
                const segments = pointer ? pointer.split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')) : [];
                // Переходим к целевому объекту
                let target = json;
                for (const seg of segments) {
                    if (target == null) break;
                    if (Array.isArray(target) && /^\d+$/.test(seg)) {
                        target = target[parseInt(seg, 10)];
                    } else {
                        target = target[seg];
                    }
                }
                if (error.keyword === 'dependencies' && error.params && error.params.missingProperty === 'type') {
                    if (target && typeof target === 'object' && !target.type) {
                        target.type = 'unknown';
                        corrections.push(`Добавлено поле type="unknown" в ${pointer || 'объект'}`);
                    }
                }
            });
        }
        window.editor.setValue(JSON.stringify(json, null, 2));
        if (corrections.length > 0) {
            document.getElementById('correctionOutput').innerHTML += `<ul>${corrections.map(c => `<li>${c}</li>`).join('')}</ul>`;
        } else {
            document.getElementById('correctionOutput').innerHTML += '<ul><li>Автоматические исправления не применялись</li></ul>';
        }
        window.clearErrorHighlights();
        window.editor.refresh();
        if (corrections.length > 0) {
            setTimeout(() => {
                window.validateJsonInternal(true);
            }, 100);
        }
    } catch (e) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка автоматического исправления: ${e.message}</li></ul>`;
    }
};

// Красивое форматирование JSON в редакторе с сохранением позиции курсора
window.formatJson = function() {
    try {
        const value = window.editor.getValue();
        if (!value.trim()) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Необходимо сперва открыть файл шаблона</li></ul>`;
            return;
        }
        // Сохраняем позицию курсора и скролл
        const cursor = window.editor.getCursor();
        const scroll = window.editor.getScrollInfo();

        let json = JSON.parse(value);
        if (Array.isArray(json)) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка: Введите один шаблон (объект JSON), а не массив</li></ul>`;
            return;
        }

        // Упорядочиваем ключи верхнего уровня по схеме (если доступна)
        if (window.schema) {
            json = window.writeJsonOrderedBySchema(json, window.schema);
        }

        window.editor.setValue(JSON.stringify(json, null, 2));
        window.editor.refresh();
        // Восстанавливаем позицию курсора и скролл
        setTimeout(() => {
            try {
                window.editor.setCursor(cursor);
                window.editor.scrollTo(scroll.left, scroll.top);
            } catch (_) {}
        }, 0);
        window.clearErrorHighlights();
        // Не засоряем вывод при сценарии one-click
        if (!window.formatFromOneClick) {
            const co = document.getElementById('correctionOutput');
            if (co && !co.innerHTML.trim()) {
                co.innerHTML = '<ul><li>JSON отформатирован</li></ul>';
            }
        }
    } catch (e) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка форматирования: ${e.message}</li></ul>`;
    }
};

window.validateJson = function(suppressCorrectionOutput = false) {
    const value = window.editor.getValue();
    if (!value.trim()) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Необходимо сперва открыть файл шаблона</li></ul>`;
        return;
    }
    document.getElementById('errorOutput').textContent = '';
    if (!suppressCorrectionOutput) document.getElementById('correctionOutput').textContent = '';
    document.getElementById('autoFixContainer').innerHTML = '';
    window.validateJsonInternal(false, suppressCorrectionOutput);
};

window.validateJsonInternal = function(isAutoValidation = false, suppressCorrectionOutput = false) {
    try {
        const jsonStr = window.editor.getValue();
        const json = JSON.parse(jsonStr);
        if (Array.isArray(json)) {
            const line = window.highlightErrorLine('', jsonStr);
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка: Введите один шаблон (объект JSON), а не массив (строка ${line})</li></ul>`;
            document.getElementById('autoFixContainer').innerHTML = '';
            return;
        }
        window.clearErrorHighlights();
        const errors = [];
        const warnings = [];
        const errorLines = new Set();
        const hasTopicGetOrSet = json.services && Array.isArray(json.services) && json.services.some(service => 
            service.characteristics && Array.isArray(service.characteristics) && service.characteristics.some(char => 
                char.link && (Array.isArray(char.link) ? char.link : [char.link]).some(link => link.topicGet || link.topicSet)
            )
        );
        if (hasTopicGetOrSet) {
            if (!json.modelId || !/\(.*\)/.test(json.modelId)) {
                const line = window.highlightErrorLine('modelId', jsonStr);
                errors.push(`В MQTT шаблонах должно быть регулярное выражение в modelId (строка ${line})`);
                errorLines.add(line);
            }
            json.services.forEach((service, serviceIndex) => {
                if (service.characteristics && Array.isArray(service.characteristics)) {
                    service.characteristics.forEach((char, charIndex) => {
                        if (char.link) {
                            const links = Array.isArray(char.link) ? char.link : [char.link];
                            links.forEach((link, linkIndex) => {
                                if (link.topicGet && !link.topicGet.includes('(1)')) {
                                    const line = window.highlightErrorLine(`services[${serviceIndex}].characteristics[${charIndex}].link[${linkIndex}].topicGet`, jsonStr);
                                    errors.push(`Поле topicGet в характеристике ${char.type || 'без типа'} не содержит подстроку "(1)" (строка ${line})`);
                                    errorLines.add(line);
                                }
                                if (link.topicSet && !link.topicSet.includes('(1)')) {
                                    const line = window.highlightErrorLine(`services[${serviceIndex}].characteristics[${charIndex}].link[${linkIndex}].topicSet`, jsonStr);
                                    errors.push(`Поле topicSet в характеристике ${char.type || 'без типа'} не содержит подстроку "(1)" (строка ${line})`);
                                    errorLines.add(line);
                                }
                            });
                        }
                    });
                }
            });
        }
        window.validateServiceAndCharacteristics(json, errors, warnings, jsonStr);
        const ajv = new Ajv({ allErrors: true, logger: false });
        const validate = ajv.compile(window.schema);
        const valid = validate(json);
        let errorOutput = '';
        if (!valid) {
            const allErrors = validate.errors || [];
            const filteredErrors = allErrors.filter(error => {
                const path = error.instancePath || error.dataPath || '';
                const hasDeeper = allErrors.some(otherError => {
                    const otherPath = otherError.instancePath || otherError.dataPath || '';
                    return otherError !== error && otherPath.startsWith(path) && otherPath.length > path.length;
                });

                const msg = error.message || '';
                const isAnyOf = error.keyword === 'anyOf';
                const isIfThenElse = error.keyword === 'if' || error.keyword === 'then' || error.keyword === 'else';
                const isGenericThenElseMsg = /should match\s+"(then|else)"\s+schema/i.test(msg);
                const isGenericMatchMsg = /should match/i.test(msg) || /should be/i.test(msg);

                // Скрываем обобщённые сообщения:
                // - anyOf с общим текстом
                // - if/then/else "should match \"then\" schema" (особенно если есть более глубокие ошибки)
                if (isAnyOf) {
                    return !hasDeeper && !isGenericMatchMsg;
                }
                if (isIfThenElse && (isGenericThenElseMsg || (isGenericMatchMsg && hasDeeper))) {
                    return false;
                }
                return true;
            });
            // Группировка ошибок по сервисам/характеристикам
            const grouped = {};
            filteredErrors.forEach(err => {
                const res = window.translateAjvError(err, json, jsonStr);
                const msg = res.message;
                // Определяем ключ группы
                const ptr = err.instancePath || err.dataPath || '';
                const p = window.jsonPointerToSegments(ptr);
                let groupKey = 'Общие ошибки';
                let serviceKey = null;
                let charKey = null;
                // Ищем индексы services[i] и characteristics[j]
                for (let i = 0; i < p.length; i++) {
                    if (p[i] === 'services' && /^\d+$/.test(p[i+1] || '')) {
                        const si = parseInt(p[i+1], 10);
                        const s = json.services && json.services[si];
                        serviceKey = s ? (s.name || s.type || `Сервис ${si+1}`) : `Сервис ${si+1}`;
                    }
                    if (p[i] === 'characteristics' && /^\d+$/.test(p[i+1] || '')) {
                        const ci = parseInt(p[i+1], 10);
                        const c = (json.services || []).flatMap(s => s.characteristics || [])[ci] || null;
                        charKey = c ? (c.type || `Характеристика ${ci+1}`) : `Характеристика ${ci+1}`;
                    }
                }
                if (serviceKey) groupKey = serviceKey;
                if (serviceKey && charKey) groupKey = `${serviceKey} → ${charKey}`;
                if (!grouped[groupKey]) grouped[groupKey] = [];
                grouped[groupKey].push({ msg, ptr });
            });

            // Рендер групп с кнопками навигации
            const items = Object.entries(grouped).map(([group, arr]) => {
                const lis = arr.map(e => `<li><button class="btn btn-link" data-jsonptr="${e.ptr}">🔎</button> ${e.msg}</li>`).join('');
                return `<li><b>${group}</b><ul>${lis}</ul></li>`;
            }).join('');
            errorOutput += items;
        }
        if (errors.length > 0) {
            errorOutput += errors.map(err => `<li>${err}</li>`).join('');
        }
        if (warnings.length > 0) {
            errorOutput += warnings.map(warn => `<li>Предупреждение: ${warn}</li>`).join('');
        }
        if (errorOutput) {
            document.getElementById('autoFixContainer').innerHTML = `<button id="autoFixButton" class="btn btn-warning" onclick="autoFixJson()">Попробовать исправить автоматически</button>`;
            const errorBox = document.getElementById('errorOutput');
            errorBox.innerHTML = `<ul>${errorOutput}</ul>`;
            // Навигация к месту ошибки по кнопкам 🔎
            errorBox.querySelectorAll('button[data-jsonptr]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const ptr = btn.getAttribute('data-jsonptr');
                    const path = jsonPointerToPath(ptr);
                    const line = window.highlightErrorLine(path, jsonStr);
                    if (line > 0) {
                        window.editor.scrollIntoView({ line: line - 1, ch: 0 }, 100);
                        window.editor.setCursor({ line: line - 1, ch: 0 });
                        window.editor.focus();
                    }
                });
            });
            if (!isAutoValidation && !suppressCorrectionOutput) {
                document.getElementById('correctionOutput').textContent = '';
            }
        } else {
            document.getElementById('autoFixContainer').innerHTML = '';
            document.getElementById('errorOutput').innerHTML = '';
            if (!isAutoValidation && !suppressCorrectionOutput) {
                document.getElementById('correctionOutput').innerHTML = `<ul><li>JSON валиден по схеме</li></ul>`;
            }
        }
        window.editor.refresh();
    } catch (e) {
        const line = e.lineNumber || 1;
        window.clearErrorHighlights();
        window.editor.addLineClass(line - 1, 'background', 'error-line');
        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка синтаксиса JSON: ${e.message} (строка ${line})</li></ul>`;
        document.getElementById('autoFixContainer').innerHTML = '';
    }
}; 