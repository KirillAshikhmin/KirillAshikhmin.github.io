// utils.js
// Вспомогательные функции, не относящиеся непосредственно к редактору кода

window.changeTheme = function() {
    const themeToggle = document.getElementById('themeToggle');
    let currentTheme = localStorage.getItem('theme');
    
    // Если тема не была установлена пользователем, определяем текущую по системной теме
    if (currentTheme === null) {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        currentTheme = prefersDark ? 'dark' : 'light';
    }
    
    // Переключаем тему между light и dark
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // Сохраняем выбор пользователя
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
};

window.applyTheme = function(theme) {
    // Удаляем все классы тем
    document.body.classList.remove('light', 'dark', 'system');
    // Добавляем текущий класс
    document.body.classList.add(theme);
    
    // Обновляем тему редактора (CM6 shim: опция темы не требуется; переключаем класс на body)
    // Стили завязаны на body.light/body.dark
    
    // Переключаем подсветку CM6 через шим
    try {
        if (window.editor && typeof window.editor.setTheme === 'function') {
            window.editor.setTheme(theme);
        }
    } catch(_) {}

    // Обновляем иконку переключателя
    updateThemeToggleIcon(theme);
};

window.updateThemeToggleIcon = function(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const lightIcon = themeToggle.querySelector('.light-icon');
    const darkIcon = themeToggle.querySelector('.dark-icon');
    
    if (theme === 'light') {
        lightIcon.style.display = 'block';
        darkIcon.style.display = 'none';
    } else {
        lightIcon.style.display = 'none';
        darkIcon.style.display = 'block';
    }
};

window.initTheme = function() {
    // Проверяем, была ли тема уже установлена пользователем
    const hasUserSetTheme = localStorage.getItem('theme') !== null;
    
    let themeToApply;
    
    if (hasUserSetTheme) {
        // Если пользователь уже устанавливал тему, используем сохраненную
        themeToApply = localStorage.getItem('theme') || 'light';
    } else {
        // При первом входе определяем системную тему
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        themeToApply = prefersDark ? 'dark' : 'light';
        // НЕ сохраняем в localStorage, пока пользователь не переключит вручную
    }
    
    applyTheme(themeToApply);
    
    // Добавляем обработчик клика на переключатель
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', changeTheme);
    }
    
    // Слушаем изменения системной темы (только если пользователь не устанавливал тему вручную)
    if (!hasUserSetTheme && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', (e) => {
            // Проверяем, что пользователь все еще не установил тему вручную
            if (localStorage.getItem('theme') === null) {
                const newTheme = e.matches ? 'dark' : 'light';
                applyTheme(newTheme);
            }
        });
    }
};

window.downloadTemplate = function() {
    try {
        const json = JSON.parse(window.editor.getValue());
        if (Array.isArray(json)) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка: Введите один шаблон (объект JSON), а не массив</li></ul>`;
            return;
        }
        const manufacturer = (json.manufacturer || 'unknown').replace(/\s+/g, '_');
        const model = (json.model || 'unknown').replace(/\s+/g, '_');
        const filename = `${manufacturer}_${model}.json`;
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка скачивания: ${e.message}</li></ul>`;
    }
};

window.initDragAndDrop = function() {
    window.dropZone = document.getElementById('dropZone');
    window.dragCounter = 0;
    
    // Функция для показа плашки
    const showDropZone = () => {
        window.dropZone.classList.add('active');
    };
    
    // Функция для скрытия плашки
    const hideDropZone = () => {
        window.dragCounter = 0;
        window.dropZone.classList.remove('active');
    };
    
    // Обработчик для обработки файла
    const handleFile = (file) => {
        if (file && file.type === 'application/json') {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    let fileContent = e.target.result;
                    fileContent = fileContent.replace(/^\uFEFF/, '');
                    const json = JSON.parse(fileContent);
                    document.getElementById('errorOutput').textContent = '';
                    document.getElementById('correctionOutput').textContent = '';
                    document.getElementById('autoFixContainer').innerHTML = '';
                    window.selectTemplateWithDropdown(json, (selectedTemplate) => {
                        window.editor.setValue(JSON.stringify(selectedTemplate, null, 2));
                        window.editor.refresh();
                    });
                } catch (e) {
                    document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка синтаксиса JSON: ${e.message}</li></ul>`;
                }
            };
            reader.readAsText(file);
        } else {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка: Перетащите файл в формате JSON</li></ul>`;
        }
    };
    
    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        window.dragCounter++;
        showDropZone();
    }, true); // capture phase
    
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    }, true); // capture phase
    
    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        window.dragCounter--;
        if (window.dragCounter <= 0) {
            hideDropZone();
        }
    }, true); // capture phase
    
    // Добавляем обработчик для window, чтобы отслеживать когда drag действительно заканчивается
    window.addEventListener('dragleave', (e) => {
        if (e.clientX <= 0 || e.clientY <= 0 || 
            e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            hideDropZone();
        }
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        hideDropZone();
        window.oneClickFixMode = false;
        const file = e.dataTransfer.files[0];
        handleFile(file);
    }, true); // capture phase
    
    // Добавляем обработчики для редактора CodeMirror с capture фазой
    if (window.editor) {
        const editorElement = window.editor.getWrapperElement();
        
        editorElement.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dragCounter++;
            showDropZone();
        }, true); // capture phase
        
        editorElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, true); // capture phase
        
        editorElement.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.dragCounter--;
            if (window.dragCounter <= 0) {
                hideDropZone();
            }
        }, true); // capture phase
        
        editorElement.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideDropZone();
            window.oneClickFixMode = false;
            const file = e.dataTransfer.files[0];
            handleFile(file);
        }, true); // capture phase
    }
};

// --- Универсальные утилиты ---
window.debounce = function(fn, delay = 300) {
    let t = null;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), delay);
    };
};

window.jsonPointerToSegments = function(pointer) {
    if (!pointer) return [];
    const raw = (pointer.startsWith('/') ? pointer.slice(1) : pointer);
    if (!raw) return [];
    return raw.split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
};

window.jsonPointerToPath = function(pointer) {
    if (!pointer) return '';
    const segments = window.jsonPointerToSegments(pointer);
    let path = '';
    segments.forEach((seg, idx) => {
        if (/^\d+$/.test(seg)) {
            path += `[${parseInt(seg, 10)}]`;
        } else {
            path += (idx === 0 ? '' : '.') + seg;
        }
    });
    return path;
};

window.segmentsGet = function(root, segments) {
    let cur = root;
    for (const seg of segments) {
        if (cur == null) return undefined;
        if (Array.isArray(cur) && /^\d+$/.test(seg)) {
            cur = cur[parseInt(seg, 10)];
        } else {
            cur = cur[seg];
        }
    }
    return cur;
};

window.ensureJsonHasTypeUnknown = function(root, pointer, corrections) {
    const segments = window.jsonPointerToSegments(pointer);
    const target = window.segmentsGet(root, segments);
    if (target && typeof target === 'object' && !target.type) {
        target.type = 'unknown';
        if (Array.isArray(corrections)) corrections.push(`Добавлено поле type="unknown" в ${pointer || 'объект'}`);
        return true;
    }
    return false;
};

window.writeJsonOrderedBySchema = function(json, schema) {
    if (!schema || !schema.properties || typeof json !== 'object' || json === null) return json;
    const ordered = {};
    const order = Object.keys(schema.properties);
    for (const k of order) {
        if (Object.prototype.hasOwnProperty.call(json, k)) ordered[k] = json[k];
    }
    for (const k of Object.keys(json)) {
        if (!Object.prototype.hasOwnProperty.call(ordered, k)) ordered[k] = json[k];
    }
    return ordered;
};

window.saveOpenState = function(editorValue, controllerValue) {
    try {
        localStorage.setItem('jsonEditorValue', editorValue);
        if (controllerValue) localStorage.setItem('selectedController', controllerValue);
    } catch {}
};

window.loadOpenState = function() {
    try {
        return {
            json: localStorage.getItem('jsonEditorValue') || '',
            controller: localStorage.getItem('selectedController') || ''
        };
    } catch {
        return { json: '', controller: '' };
    }
};

// computeJsonDiff / renderDiffPreview / escapeHtml удалены — дифф-превью отключено

window.detectControllerType = function(template, controllerFields) {
    // Собираем все link-объекты из characteristics и options
    function collectLinks(obj) {
        let links = [];
        if (obj.services && Array.isArray(obj.services)) {
            obj.services.forEach(service => {
                if (service.characteristics && Array.isArray(service.characteristics)) {
                    service.characteristics.forEach(char => {
                        if (char.link) {
                            if (Array.isArray(char.link)) {
                                links.push(...char.link);
                            } else {
                                links.push(char.link);
                            }
                        }
                    });
                }
            });
        }
        if (obj.options && Array.isArray(obj.options)) {
            obj.options.forEach(opt => {
                if (opt.link) {
                    if (Array.isArray(opt.link)) {
                        links.push(...opt.link);
                    } else {
                        links.push(opt.link);
                    }
                }
            });
        }
        return links;
    }
    const links = collectLinks(template);
    if (!links.length) return null;
    // Считаем совпадения по каждому типу
    let bestType = null;
    let bestCount = 0;
    for (const [type, fields] of Object.entries(controllerFields)) {
        const searchFields = fields.search;
        let count = 0;
        links.forEach(link => {
            if (searchFields && searchFields.some(field => link && Object.prototype.hasOwnProperty.call(link, field))) {
                count++;
            }
        });
        if (count > bestCount) {
            bestCount = count;
            bestType = type;
        }
    }
    // Если есть хотя бы одно совпадение — возвращаем bestType
    return bestCount > 0 ? bestType : null;
}; 