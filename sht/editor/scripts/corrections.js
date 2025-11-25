// corrections.js
// Модуль только для исправления шаблонов (applyCorrections, correctJson, oneClickFix, oneClickFixRun)
// Глобальные функции для использования в index.html и других js-файлах

// Используем константы из constants.js

// ... Здесь будет только логика applyCorrections ...

// --- CodeMirror и редактор ---
// (сюда переносится инициализация редактора, функции работы с темой, загрузкой файлов, drag&drop и т.д.)

// --- Схема аксессуара и автокомплит ---
// (сюда переносится buildSchemaHintsTree, loadSchema, getCurrentJsonPath, getHintsForPath, автокомплит CodeMirror)

// --- Валидация, подсветка ошибок, исправления ---
// (сюда переносится validateServiceAndCharacteristics, translateAjvError, autoFixJson, validateJson, validateJsonInternal, applyCorrections, correctJson, oneClickFix, oneClickFixRun, formatJson, highlightErrorLine, clearErrorHighlights)

// --- Архивы и пакетная обработка ---
// (функции processTemplateFiles, processZipArchive, processTarGzArchive находятся в archive.js)

// --- Экспортируемые функции ---
// (экспортируются applyCorrections, validateServiceAndCharacteristics и другие нужные функции)

window.applyCorrections = function(jsonToCorrect, schema, allowedInputTypesFromSchema) {
    // Функция применяет исправления к шаблону согласно новым требованиям Sprut.Hub
    // - Преобразует manufacturerId/modelId в массивы manufacturerIds/modelIds
    // - Обрабатывает разделители | в строках
    // - Удаляет скобки из значений
    // - Очищает массивы от дубликатов и пустых значений
    // - Удаляет неиспользуемые поля (status, date, overview, url, ali, ali2)
    const newJson = JSON.parse(JSON.stringify(jsonToCorrect)); // Глубокая копия
    const corrections = [];

    // Преобразование topicSearch в modelIds
    let topicSearchValue = null;
    function findAndRemoveTopicSearch(obj) {
        let removed = false;
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                if (key === 'topicSearch') {
                    const value = Array.isArray(obj[key]) ? obj[key][0] : obj[key];
                    if (!topicSearchValue && value) { // Сохраняем только первое найденное непустое значение
                        topicSearchValue = value;
                    }
                    delete obj[key];
                    removed = true;
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (findAndRemoveTopicSearch(obj[key])) {
                        removed = true;
                    }
                }
            }
        }
        return removed;
    }

    if (findAndRemoveTopicSearch(newJson)) {
        if (topicSearchValue) {
            // Создаем массив modelIds если его нет
            if (!newJson.modelIds) {
                newJson.modelIds = [];
            }
            // Добавляем значение topicSearch в массив modelIds
            if (!newJson.modelIds.includes(topicSearchValue)) {
                newJson.modelIds.push(topicSearchValue);
            }
            corrections.push(`Значение topicSearch перенесено в modelIds и все его вхождения удалены.`);
        } else {
            corrections.push(`Пустое поле topicSearch удалено из шаблона.`);
        }
    }

    // --- Замена разделителей и переименование ключей ---
    let renameCorrectionAdded = false;
    let separatorCorrectionAdded = false;

    const renameMap = {
        mapOut: 'outMap',
        mapIn: 'map',
        inMap: 'map',
        funcOut: 'outFunc',
        func: 'inFunc',
        funcIn: 'inFunc'
    };

    function processRecursively(obj) {
        if (!obj || typeof obj !== 'object') {
            return;
        }
        if (Array.isArray(obj)) {
            obj.forEach(processRecursively);
            return;
        }

        // Переименование ключей
        const currentKeys = Object.keys(obj);
        let renamedInThisObject = false;
        for (const oldKey of currentKeys) {
            if (renameMap.hasOwnProperty(oldKey)) {
                const newKey = renameMap[oldKey];
                if (!obj.hasOwnProperty(newKey)) { // чтобы не затереть существующий ключ
                   obj[newKey] = obj[oldKey];
                }
                delete obj[oldKey];
                renamedInThisObject = true;
            }
        }

        if (renamedInThisObject && !renameCorrectionAdded) {
            corrections.push('Выполнено переименование полей (mapOut->outMap, inMap/mapIn->map, funcOut->outFunc, func/funcIn->inFunc)');
            renameCorrectionAdded = true;
        }

        // Обход всех ключей для дальнейшей обработки
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                // Замена разделителей
                if (key === 'validValues' && typeof value === 'string' && value.includes(';')) {
                    obj[key] = value.replace(/;/g, ',');
                    separatorCorrectionAdded = true;
                }
                if ((key === 'map' || key === 'outMap') && typeof value === 'string' && value.includes(',')) {
                    obj[key] = value.replace(/,/g, ';');
                    separatorCorrectionAdded = true;
                }

                // Рекурсивный вызов для вложенных объектов
                processRecursively(value);
            }
        }
    }

    processRecursively(newJson);
    
    if (separatorCorrectionAdded) {
        corrections.push("Произведена замена разделителей: в `validValues` (`;` на `,`), в `map`/`outMap` (`,` на `;`).");
    }

    // Исправление template
    if (typeof newJson.template === 'string') {
        newJson.template = [newJson.template];
        corrections.push(`Поле template преобразовано в массив`);
    }

    // Преобразование старых полей manufacturerId и modelId в новые массивы manufacturerIds и modelIds
    if (newJson.hasOwnProperty('manufacturerId')) {
        if (!newJson.manufacturerIds) {
            newJson.manufacturerIds = [];
        }
        if (typeof newJson.manufacturerId === 'string') {
            let value = newJson.manufacturerId;
            // Удаляем скобки если есть
            if (value.startsWith('(') && value.endsWith(')')) {
                value = value.slice(1, -1);
                corrections.push(`Удалены скобки из manufacturerId`);
            }
            // Разбиваем по разделителю | и добавляем в массив
            if (value.includes('|')) {
                const values = value.split('|').filter(v => v.trim());
                values.forEach(v => {
                    if (!newJson.manufacturerIds.includes(v.trim())) {
                        newJson.manufacturerIds.push(v.trim());
                    }
                });
                corrections.push(`Поле manufacturerId преобразовано в массив manufacturerIds`);
            } else if (value.trim()) {
                if (!newJson.manufacturerIds.includes(value.trim())) {
                    newJson.manufacturerIds.push(value.trim());
                }
                corrections.push(`Поле manufacturerId преобразовано в массив manufacturerIds`);
            }
        }
        delete newJson.manufacturerId;
    }

    if (newJson.hasOwnProperty('modelId')) {
        if (!newJson.modelIds) {
            newJson.modelIds = [];
        }
        if (typeof newJson.modelId === 'string') {
            let value = newJson.modelId;
            // Удаляем скобки если есть
            if (value.startsWith('(') && value.endsWith(')')) {
                value = value.slice(1, -1);
                corrections.push(`Удалены скобки из modelId`);
            }
            // Разбиваем по разделителю | и добавляем в массив
            if (value.includes('|')) {
                const values = value.split('|').filter(v => v.trim());
                values.forEach(v => {
                    if (!newJson.modelIds.includes(v.trim())) {
                        newJson.modelIds.push(v.trim());
                    }
                });
                corrections.push(`Поле modelId преобразовано в массив modelIds`);
            } else if (value.trim()) {
                if (!newJson.modelIds.includes(value.trim())) {
                    newJson.modelIds.push(value.trim());
                }
                corrections.push(`Поле modelId преобразовано в массив modelIds`);
            }
        }
        delete newJson.modelId;
    }

    // Обработка существующих массивов manufacturerIds и modelIds для очистки и валидации
    if (newJson.manufacturerIds && Array.isArray(newJson.manufacturerIds)) {
        // Удаляем пустые значения и дубликаты
        const originalLength = newJson.manufacturerIds.length;
        newJson.manufacturerIds = newJson.manufacturerIds
            .filter(id => id && typeof id === 'string' && id.trim())
            .map(id => id.trim())
            .filter((id, index, arr) => arr.indexOf(id) === index); // удаляем дубликаты
        
        if (newJson.manufacturerIds.length !== originalLength) {
            corrections.push(`Очищен массив manufacturerIds: удалены пустые значения и дубликаты`);
        }
    } else if (newJson.manufacturerIds && !Array.isArray(newJson.manufacturerIds)) {
        // Если поле существует, но не является массивом, преобразуем его
        if (typeof newJson.manufacturerIds === 'string') {
            let value = newJson.manufacturerIds;
            if (value.includes('|')) {
                newJson.manufacturerIds = value.split('|').filter(v => v.trim()).map(v => v.trim());
                corrections.push(`Поле manufacturerIds преобразовано из строки в массив`);
            } else {
                newJson.manufacturerIds = [value.trim()];
                corrections.push(`Поле manufacturerIds преобразовано из строки в массив`);
            }
        } else {
            newJson.manufacturerIds = [];
            corrections.push(`Поле manufacturerIds преобразовано в пустой массив`);
        }
    }

    if (newJson.modelIds && Array.isArray(newJson.modelIds)) {
        // Удаляем пустые значения и дубликаты
        const originalLength = newJson.modelIds.length;
        newJson.modelIds = newJson.modelIds
            .filter(id => id && typeof id === 'string' && id.trim())
            .map(id => id.trim())
            .filter((id, index, arr) => arr.indexOf(id) === index); // удаляем дубликаты
        
        if (newJson.modelIds.length !== originalLength) {
            corrections.push(`Очищен массив modelIds: удалены пустые значения и дубликаты`);
        }
    } else if (newJson.modelIds && !Array.isArray(newJson.modelIds)) {
        // Если поле существует, но не является массивом, преобразуем его
        if (typeof newJson.modelIds === 'string') {
            let value = newJson.modelIds;
            if (value.includes('|')) {
                newJson.modelIds = value.split('|').filter(v => v.trim()).map(v => v.trim());
                corrections.push(`Поле modelIds преобразовано из строки в массив`);
            } else {
                newJson.modelIds = [value.trim()];
                corrections.push(`Поле modelIds преобразовано из строки в массив`);
            }
        } else {
            newJson.modelIds = [];
            corrections.push(`Поле modelIds преобразовано в пустой массив`);
        }
    }

    // Удаление неиспользуемых полей из корня шаблона
    const unusedFields = ['status', 'date', 'overview', 'url', 'ali', 'ali2'];
    let removedFields = [];
    
    unusedFields.forEach(field => {
        if (newJson.hasOwnProperty(field)) {
            delete newJson[field];
            removedFields.push(field);
        }
    });
    
    if (removedFields.length > 0) {
        corrections.push(`Удалены неиспользуемые поля: ${removedFields.join(', ')}`);
    }

    // --- Вспомогательная функция для обработки link ---
    function fixLinkType(link, context, corrections) {
        if (!Array.isArray(link)) return;
        link.forEach((l, idx) => {
            if (l && typeof l === 'object') {
                if (l.type === 'Float') {
                    l.type = 'Double';
                    corrections.push(`В link${context ? ' ' + context : ''} №${idx + 1}: Тип Float заменён на Double`);
                }
                // Рекурсивно обрабатываем вложенные объекты внутри link
                Object.keys(l).forEach(key => {
                    if (typeof l[key] === 'object' && l[key] !== null) {
                        fixLinkType(Array.isArray(l[key]) ? l[key] : [l[key]], context, corrections);
                    }
                });
            }
        });
    }

    // Исправление link в characteristics
    if (newJson.services && Array.isArray(newJson.services)) {
        newJson.services.forEach((service, serviceIndex) => {
            if (service.characteristics && Array.isArray(service.characteristics)) {
                service.characteristics.forEach(characteristic => {
                    if (characteristic.link && !Array.isArray(characteristic.link)) {
                        characteristic.link = [characteristic.link];
                        const serviceName = service.name ? ` сервиса "${service.name}"` : '';
                        corrections.push(`Поле link в характеристике ${characteristic.type || ''}${serviceName} преобразовано в массив`);
                    }
                    // Исправление типа внутри link
                    if (characteristic.link) {
                        fixLinkType(characteristic.link, `характеристики ${characteristic.type || ''}`, corrections);
                    }
                });
            }
        });
    }

    // Исправление link и типа в options
    if (newJson.options && Array.isArray(newJson.options)) {
        newJson.options.forEach(option => {
            // 1. Переименование input -> inputType
            if (option.hasOwnProperty('input')) {
                option.inputType = option.input;
                delete option.input;
                corrections.push(`В опции ${option.name || ''} поле input переименовано в inputType`);
            }
            // 2. Замена значения inputType на допустимое из схемы (без учета регистра)
            if (option.hasOwnProperty('inputType') && typeof option.inputType === 'string' && Array.isArray(allowedInputTypesFromSchema)) {
                const found = allowedInputTypesFromSchema.find(v => v.toLowerCase() === option.inputType.toLowerCase());
                if (found && found !== option.inputType) {
                    corrections.push(`В опции ${option.name || ''} значение inputType заменено с "${option.inputType}" на "${found}"`);
                    option.inputType = found;
                }
            }
            // Удаление init: false
            if (option.hasOwnProperty('init') && option.init === false) {
                delete option.init;
                corrections.push(`В опции ${option.name || ''} поле init: false удалено`);
            }
            if (option.link && !Array.isArray(option.link)) {
                option.link = [option.link];
                corrections.push(`Поле link в опции "${option.name || ''}" преобразовано в массив`);
            }
            // Исправление типа внутри link
            if (option.link) {
                fixLinkType(option.link, `опции ${option.name || ''}`, corrections);
            }
        });
    }

    // Исправление link в init
    let initLinkCorrectionAdded = false;
    if (newJson.init && Array.isArray(newJson.init)) {
        newJson.init.forEach((initCmd) => {
            if (initCmd.link && !Array.isArray(initCmd.link)) {
                initCmd.link = [initCmd.link];
                if (!initLinkCorrectionAdded) {
                    corrections.push(`Поле link в командах инициализации (init) преобразовано в массив`);
                    initLinkCorrectionAdded = true;
                }
            }
        });
    }

    // Reorder keys for better readability before displaying
    let keyOrder = [];
    if (schema && schema.properties) {
        keyOrder = Object.keys(schema.properties);
    }
    const orderedJson = {};
    const remainingKeys = { ...newJson };
    
    // Сначала добавляем ключи в порядке схемы
    for (const key of keyOrder) {
        if (Object.prototype.hasOwnProperty.call(newJson, key)) {
            orderedJson[key] = newJson[key];
            delete remainingKeys[key];
        }
    }
    
    // Затем добавляем оставшиеся ключи
    Object.assign(orderedJson, remainingKeys);
    
    return { finalJson: orderedJson, corrections };
};

window.correctJson = function() {
    try {
        const value = window.editor.getValue();
        if (!value.trim()) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>Необходимо сперва открыть файл шаблона</li></ul>`;
            return;
        }
        document.getElementById('errorOutput').textContent = '';
        document.getElementById('correctionOutput').textContent = '';
        document.getElementById('autoFixContainer').innerHTML = '';
        let json = JSON.parse(value);
        window.oneClickFixMode = false;
        window.selectTemplateWithDropdown(json, (selected) => {
            // Очищаем состояние свёрнутости при выборе шаблона
                            if (window.clearFormCollapsedState) {
                    window.clearFormCollapsedState();
                }
                if (window.clearFormDatalists) {
                    window.clearFormDatalists();
                }
            
            const templates = Array.isArray(json) ? json : (json && typeof json === 'object' && Object.keys(json).every(k => /^\d+$/.test(k))) ? Object.values(json) : [json];
            const selectedTemplate = (typeof selected === 'number') ? (templates[selected] ?? templates[0]) : (selected || templates[0]);
            const { finalJson, corrections } = window.applyCorrections(selectedTemplate, window.schema, window.allowedInputTypesFromSchema);
            window.editor.setValue(JSON.stringify(finalJson, null, 2));
            const list = corrections.length > 0
                ? `<ul>${corrections.map(c => `<li>${c}</li>`).join('')}</ul>`
                : '<ul><li>Исправления не требовались</li></ul>';
            const out = document.getElementById('correctionOutput');
            out.innerHTML = list;
            window.clearErrorHighlights();
            window.editor.refresh();
            
            // Обновляем форму, если она активна
            try {
                if (window.renderFormEditor && document.getElementById('formEditor') && document.getElementById('formEditor').style.display !== 'none') {
                    window.renderFormEditor();
                }
            } catch(_) {}
        });
    } catch (e) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка исправления: ${e.message}</li></ul>`;
    }
};

window.oneClickFix = async function() {
    const openFileFirst = document.getElementById('oneClickOpenFileCheckbox').checked;
    if (openFileFirst) {
        const fileInput = document.getElementById('autoFixFileInput');
        fileInput.accept = '.json,.zip,application/gzip,application/x-gzip,application/x-tar,.gz,.tar.gz';
        fileInput.onchange = async function(event) {
            const file = event.target.files[0];
            event.target.value = '';
            if (file) {
                if (file.name.endsWith('.zip')) {
                    await window.processZipArchive(file);
                    return;
                }
                if (file.name.endsWith('.tar.gz')) {
                    await window.processTarGzArchive(file);
                    return;
                }
                const reader = new FileReader();
                reader.onload = async function(e) {
                    try {
                        let fileContent = e.target.result;
                        // Используем централизованную нормализацию контента
                        fileContent = window.ContentNormalizer?.normalizeContent(fileContent) || fileContent.replace(/^\uFEFF/, '');
                        let parsed;
                        try {
                            parsed = JSON.parse(fileContent);
                        } catch (err) {
                            document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка чтения файла: ${err.message}</li></ul>`;
                            return;
                        }
                        document.getElementById('errorOutput').textContent = '';
                        document.getElementById('correctionOutput').textContent = '';
                        document.getElementById('autoFixContainer').innerHTML = '';
                        if (Array.isArray(parsed) && parsed.length > 1) {
                            window.oneClickFixMode = true;
                            window.selectTemplateWithDropdown(parsed, (selected) => {
                                const selectedTemplate = (typeof selected === 'number') ? (parsed[selected] ?? parsed[0]) : (selected || parsed[0]);
                                window.editor.setValue(JSON.stringify(selectedTemplate, null, 2));
                                window.editor.refresh();
                            });
                        } else {
                            const template = Array.isArray(parsed) ? parsed[0] : parsed;
                            window.editor.setValue(JSON.stringify(template, null, 2));
                            window.editor.refresh();
                            await window.oneClickFixRun();
                        }
                    } catch (err) {
                        document.getElementById('errorOutput').innerHTML = `<ul><li>Ошибка чтения файла: ${err.message}</li></ul>`;
                    }
                };
                reader.readAsText(file);
            }
        };
        fileInput.click();
        return;
    }
    await window.oneClickFixRun();
};

window.oneClickFixRun = async function() {
    const btn = document.querySelector('button[onclick="oneClickFix()"]');
    btn.disabled = true;
    btn.textContent = 'Выполняется...';
    document.getElementById('correctionOutput').innerHTML = '<ul><li>Запущен фикс в 1 клик...</li></ul>';
    try {
        const json = JSON.parse(window.editor.getValue());
        if (Array.isArray(json)) {
            document.getElementById('errorOutput').innerHTML = `<ul><li>"Фикс в 1 клик" не работает с файлами, содержащими несколько шаблонов. Пожалуйста, выберите и загрузите один шаблон в редактор.</li></ul>`;
            return;
        }
        const { finalJson, corrections } = window.applyCorrections(json, window.schema, window.allowedInputTypesFromSchema);
        window.editor.setValue(JSON.stringify(finalJson, null, 2));
        if (corrections.length > 0) {
            const el = document.getElementById('correctionOutput');
            el.innerHTML += `<ul>${corrections.map(c => `<li>${c}</li>`).join('')}</ul>`;
        } else {
            document.getElementById('correctionOutput').innerHTML += '<ul><li>Исправления не требовались.</li></ul>';
        }
        
        // Обновляем форму, если она активна
        try {
            if (window.renderFormEditor && document.getElementById('formEditor') && document.getElementById('formEditor').style.display !== 'none') {
                window.renderFormEditor();
            }
        } catch(_) {}
        await new Promise(r => setTimeout(r, window.CONSTANTS?.TIMING?.AUTOCOMPLETE_SHORT_DELAY || 50));
        window.validateJson(true);
        let hasErrors = document.getElementById('errorOutput').innerHTML.trim() !== '';
        if (!hasErrors) {
            document.getElementById('correctionOutput').innerHTML += '<ul><li>Скачивание...</li></ul>';
            window.formatFromOneClick = true;
            window.formatJson();
            window.formatFromOneClick = false;
            window.downloadTemplate();
            return;
        }
        document.getElementById('correctionOutput').innerHTML += '<ul><li>Найдены ошибки, попытка автоматического исправления...</li></ul>';
        window.autoFixJson(false);
        await new Promise(r => setTimeout(r, window.CONSTANTS?.TIMING?.VALIDATION_AFTER_FIX || 200));
        hasErrors = document.getElementById('errorOutput').innerHTML.trim() !== '';
        if (!hasErrors) {
            document.getElementById('correctionOutput').innerHTML += '<ul><li>Авто-исправление успешно! Скачивание...</li></ul>';
            window.formatFromOneClick = true;
            window.formatJson();
            window.formatFromOneClick = false;
            window.downloadTemplate();
        } else {
            document.getElementById('correctionOutput').innerHTML += '<ul><li>Не удалось исправить все ошибки автоматически. Пожалуйста, исправьте их вручную.</li></ul>';
        }
    } catch (e) {
        document.getElementById('errorOutput').innerHTML = `<ul><li>Произошла ошибка в процессе "Фикс в 1 клик": ${e.message}</li></ul>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Фикс в 1 клик';
    }
};

// --- Экспортируемые функции ---
if (typeof module !== 'undefined') {
    module.exports = {
        applyCorrections,
        validateServiceAndCharacteristics: (json, errors, warnings, jsonStr) => {
            if (typeof window !== 'undefined' && typeof window.validateServiceAndCharacteristics === 'function') {
                return window.validateServiceAndCharacteristics(json, errors, warnings, jsonStr);
            }
        }
    };
}