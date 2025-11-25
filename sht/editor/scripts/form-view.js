// form-view.js
// Рендер динамической формы по текущему JSON и схеме. Двусторонняя синхронизация с редактором кода.

// Используем константы из constants.js

(function(){
    // Глобальная переменная для сохранения состояния свёрнутости блоков
    let collapsedSections = new Set();
    
    // Загружаем сохраненное состояние из localStorage при инициализации
    function loadCollapsedState() {
        try {
            const saved = localStorage.getItem('formCollapsedSections');
            if (saved) {
                const savedArray = JSON.parse(saved);
                collapsedSections = new Set(savedArray);
            }
        } catch (e) {
            console.warn('Ошибка загрузки состояния свёрнутости:', e);
            collapsedSections = new Set();
        }
    }
    
    // Сохраняем состояние в localStorage
    function saveCollapsedStateToStorage() {
        try {
            const array = Array.from(collapsedSections);
            localStorage.setItem('formCollapsedSections', JSON.stringify(array));
        } catch (e) {
            console.warn('Ошибка сохранения состояния свёрнутости:', e);
        }
    }
    
    function getJsonSafe(){
        try { const v = window.editor.getValue(); return v?.trim()? JSON.parse(v) : {}; } catch { return {}; }
    }
    
    // Функция для сохранения состояния свёрнутости секции
    function saveCollapsedState(path, isCollapsed) {
        if (isCollapsed) {
            collapsedSections.add(path);
        } else {
            collapsedSections.delete(path);
        }
        // Сохраняем в localStorage при каждом изменении
        saveCollapsedStateToStorage();
    }
    
    // Функция для проверки состояния свёрнутости секции
    function isSectionCollapsed(path) {
        return collapsedSections.has(path);
    }
    
    // Функция для очистки состояния свёрнутости (при загрузке нового шаблона)
    function clearCollapsedState() {
        collapsedSections.clear();
        saveCollapsedStateToStorage();
    }
    
    // Делаем функцию доступной глобально для вызова из других скриптов
    window.clearFormCollapsedState = clearCollapsedState;
    
    // Функция для очистки всех datalist элементов
    function clearAllDatalists() {
        const datalists = document.querySelectorAll('datalist[id^="dl-"]');
        datalists.forEach(dl => dl.remove());
    }
    

    
    // Очищаем datalist при переключении на форму
    document.addEventListener('DOMContentLoaded', () => {
        const formRadio = document.getElementById('viewForm');
        if (formRadio) {
            formRadio.addEventListener('change', () => {
                if (window.clearFormDatalists) {
                    window.clearFormDatalists();
                }
            });
        }
    });
    
    // Функция для создания улучшенного интерфейса добавления поля
    function createAddFieldInterface(container, obj, schemaNode, path) {
        
        const addRow = document.createElement('div');
        addRow.className = 'add-field-row';
        
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'array-add-btn';
        addBtn.textContent = 'Добавить поле';
        
        addBtn.addEventListener('click', () => {
            // Скрываем кнопку и показываем интерфейс добавления
            addBtn.style.display = 'none';
            
            // Создаем контейнер для интерфейса добавления
            const addInterface = document.createElement('div');
            addInterface.className = 'add-field-interface';
            
                        // Поле ввода ключа с выпадающим списком
            const keyRow = document.createElement('div');
            keyRow.className = 'add-field-key-row';
            
            const keyLabel = document.createElement('label');
            keyLabel.textContent = 'Ключ:';
            keyLabel.className = 'add-field-label';
            keyRow.appendChild(keyLabel);
            
            // Контейнер для combobox и кнопок
            const inputContainer = document.createElement('div');
            inputContainer.className = 'add-field-input-container';
            keyRow.appendChild(inputContainer);
            
            // Получаем доступные ключи из схемы
            let propsKeys = [];
            
            // Определяем схему для текущего контекста на основе пути
            let contextSchema = null;
            
            // Проверяем, что схема загружена
            if (!window.schema) {
                console.warn('Схема не загружена, используем fallback');
                // Fallback: используем переданную схему или объект
                if (schemaNode && schemaNode.properties) {
                    contextSchema = schemaNode.properties;
                } else if (obj && typeof obj === 'object') {
                    // Создаем простую схему на основе объекта
                    contextSchema = {};
                    Object.keys(obj).forEach(key => {
                        if (obj[key] !== null && typeof obj[key] !== 'undefined') {
                            contextSchema[key] = { type: typeof obj[key] };
                        }
                    });
                }
            } else {
                if (path.includes('services.') && path.includes('.characteristics.')) {
                    // Это характеристика внутри сервиса
                    contextSchema = window.schema?.properties?.services?.items?.properties?.characteristics?.items?.properties;
                } else if (path.includes('services.') && path.includes('.link.')) {
                    // Это линк внутри сервиса
                    contextSchema = window.schema?.properties?.services?.items?.properties?.link?.items?.properties;
                } else if (path.includes('services.') && !path.includes('.characteristics.') && !path.includes('.link.')) {
                    // Это сервис
                    contextSchema = window.schema?.properties?.services?.items?.properties;
                } else if (path.includes('options.')) {
                    // Это опция
                    contextSchema = window.schema?.properties?.options?.items?.properties;
                } else if (path.includes('init.')) {
                    // Это инициализация
                    contextSchema = window.schema?.properties?.init?.properties;
                } else if (path === 'root') {
                    // Это корневой объект
                    contextSchema = window.schema?.properties;
                }
            }
            
            // Приоритет: 1) схема для контекста, 2) переданная схема, 3) ключи из объекта
            if (contextSchema && Object.keys(contextSchema).length > 0) {
                propsKeys = Object.keys(contextSchema);
            } else if (schemaNode && schemaNode.properties && Object.keys(schemaNode.properties).length > 0) {
                propsKeys = Object.keys(schemaNode.properties);
            } else if (obj && typeof obj === 'object') {
                propsKeys = Object.keys(obj);
            }
            
            // Фильтруем поля: исключаем уже существующие и массивы
            if (propsKeys.length > 0) {
                propsKeys = propsKeys.filter(key => {
                    // Исключаем уже существующие поля
                    if (obj && obj.hasOwnProperty(key)) {
                        return false;
                    }
                    
                    // Исключаем массивы (services, options, characteristics, link)
                    if (['services', 'options', 'characteristics', 'link'].includes(key)) {
                        return false;
                    }
                    
                    // Исключаем поля, которые являются массивами в схеме
                    if (contextSchema && contextSchema[key] && contextSchema[key].type === 'array') {
                        return false;
                    }
                    
                    return true;
                });
            }
            
            // Если нет доступных полей, не показываем кнопку
            if (!propsKeys || propsKeys.length === 0) {
                console.warn('Нет доступных полей для добавления');
                return null;
            }
            
            // Создаем combobox поле с возможностью ввода и выпадающим списком
            
            // Проверяем, что createCombobox доступен
            if (!window.createCombobox) {
                console.error('createCombobox не найден, создаем fallback поле');
                // Fallback: создаем простое текстовое поле
                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Введите ключ поля';
                input.className = 'add-field-key-input';
                input.addEventListener('input', validateKey);
                inputContainer.appendChild(input);
                inputContainer.appendChild(okBtn);
                addInterface.appendChild(keyRow);
                return;
            }
            
            const combobox = window.createCombobox(
                propsKeys,
                'Введите ключ поля',
                (selectedKey) => {
                    // Обработчик выбора из списка
                    validateKey();
                },
                (inputValue) => {
                    // Обработчик ввода текста
                    validateKey();
                },
                false // autoOpen: отключен для всех combobox в форме
            );
            
            // Добавляем обработчик клавиш для combobox
            combobox.input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !okBtn.disabled) {
                    okBtn.click();
                } else if (e.key === 'Escape') {
                    // Закрываем интерфейс по ESC
                    addInterface.remove();
                    addBtn.style.display = 'block';
                }
            });
            
            // Добавляем обработчик ввода для активации кнопки OK при изменении ключа
            combobox.input.addEventListener('input', () => {
                // Если поле значения уже показано, скрываем его и сбрасываем кнопку OK
                if (valueContainer.style.display !== 'none') {
                    valueContainer.style.display = 'none';
                    okBtn.disabled = true;
                    okBtn.textContent = 'OK';
                    okBtn.classList.remove('ok-success');
                }
                validateKey();
            });
            
            const finalKeyInput = combobox.container;
            const keyInput = combobox.input;
            
            // Добавляем combobox в контейнер
            inputContainer.appendChild(finalKeyInput);
            
            // Кнопка OK (изначально неактивна)
            const okBtn = document.createElement('button');
            okBtn.className = 'add-field-ok-btn';
            okBtn.textContent = 'OK';
            okBtn.disabled = true;
            
            inputContainer.appendChild(okBtn);
            addInterface.appendChild(keyRow);
            
            // Контейнер для поля значения (изначально скрыт)
            const valueContainer = document.createElement('div');
            valueContainer.className = 'value-container';
            valueContainer.style.display = 'none';
            valueContainer.style.marginTop = '10px';
            addInterface.appendChild(valueContainer);
            
            // Функция для проверки валидности ключа
            function validateKey() {
                const key = keyInput.value.trim();
                const isValid = key && (propsKeys.length === 0 || propsKeys.includes(key));
                okBtn.disabled = !isValid;
                return isValid;
            }
            

            
            // Обработчик клика по OK
            okBtn.addEventListener('click', () => {
                const key = keyInput.value.trim();
                if (!validateKey()) return;
                
                // Блокируем кнопку OK после первого нажатия
                okBtn.disabled = true;
                okBtn.textContent = 'OK ✓';
                okBtn.classList.add('ok-success');
                
                // Показываем поле значения
                valueContainer.style.display = 'block';
                
                // Очищаем предыдущее поле значения, если оно есть
                const existingValueField = valueContainer.querySelector('.form-field-row');
                if (existingValueField) {
                    existingValueField.remove();
                }
                
                // Определяем тип поля и создаем соответствующее поле ввода
                // Используем contextSchema для определения типа поля
                let fieldDef = null;
                if (contextSchema && contextSchema[key]) {
                    fieldDef = contextSchema[key];
                } else if (schemaNode && schemaNode.properties && schemaNode.properties[key]) {
                    fieldDef = schemaNode.properties[key];
                }
                let valueField = null;
                
                if (fieldDef) {
                    // Создаем поле в зависимости от типа
                    if (fieldDef.type === 'boolean') {
                        // Используем switch вместо checkbox
                        valueField = document.createElement('div');
                        valueField.className = 'switch-container';
                        
                        const switchEl = document.createElement('div');
                        switchEl.className = 'switch add-field-switch';
                        
                        const switchThumb = document.createElement('div');
                        switchThumb.className = 'switch-thumb';
                        
                        switchEl.appendChild(switchThumb);
                        valueField.appendChild(switchEl);
                        
                        // Обработчик клика для switch
                        let isOn = false;
                        switchEl.addEventListener('click', () => {
                            isOn = !isOn;
                            if (isOn) {
                                switchEl.style.backgroundColor = '#007bff';
                                switchThumb.style.transform = 'translateX(26px)';
                            } else {
                                switchEl.style.backgroundColor = '#ccc';
                                switchThumb.style.transform = 'translateX(0)';
                            }
                            
                            // Обновляем значение в объекте для предварительного просмотра
                            obj[key] = isOn;
                        });
                        
                        // Сохраняем состояние switch
                        valueField.isOn = () => isOn;
                    } else if (fieldDef.type === 'number' || fieldDef.type === 'integer') {
                        valueField = document.createElement('input');
                        valueField.type = 'number';
                        if (fieldDef.minimum !== undefined) valueField.min = fieldDef.minimum;
                        if (fieldDef.maximum !== undefined) valueField.max = fieldDef.maximum;
                        
                        // Добавляем немедленное обновление при вводе
                        valueField.addEventListener('input', () => {
                            const numValue = valueField.value === '' ? null : Number(valueField.value);
                            // Обновляем значение в объекте для предварительного просмотра
                            obj[key] = numValue;
                        });
                    } else if (Array.isArray(fieldDef.enum) && fieldDef.enum.length > 0) {
                        // Используем combobox для enum полей
                        // Для поля type у сервиса не раскрываем список автоматически
                        const combobox = window.createCombobox(
                            fieldDef.enum.map(v => String(v)),
                            'Выберите значение...',
                            (selectedValue) => {
                                // Обновляем значение в объекте для предварительного просмотра
                                obj[key] = selectedValue;
                            },
                            (inputValue) => {
                                // При вводе текста обновляем значение в объекте для предварительного просмотра
                                obj[key] = inputValue;
                            },
                            false // autoOpen: отключен для всех combobox в форме
                        );
                        valueField = combobox.container;
                        // Сохраняем ссылку на combobox для получения значения
                        valueField.combobox = combobox;
                    } else if (fieldDef.validValues && Array.isArray(fieldDef.validValues) && fieldDef.validValues.length > 0) {
                        // Поле с validValues - используем combobox
                        const combobox = window.createCombobox(
                            fieldDef.validValues.map(v => String(v)),
                            'Выберите значение...',
                            (selectedValue) => {
                                // Обновляем значение в объекте для предварительного просмотра
                                obj[key] = selectedValue;
                            },
                            (inputValue) => {
                                // При вводе текста обновляем значение в объекте для предварительного просмотра
                                obj[key] = inputValue;
                            },
                            false // autoOpen: отключен для всех combobox в форме
                        );
                        valueField = combobox.container;
                        // Сохраняем ссылку на combobox для получения значения
                        valueField.combobox = combobox;
                    } else if (fieldDef.type === 'array' && fieldDef.items && fieldDef.items.type === 'string' && fieldDef.items.enum) {
                        // Массив чекбоксов для validValues
                        valueField = document.createElement('div');
                        valueField.className = 'checkbox-array';
                        
                        fieldDef.items.enum.forEach(val => {
                            const label = document.createElement('label');
                            label.className = 'checkbox-array-label';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.value = val;
                            
                            const span = document.createElement('span');
                            span.textContent = val;
                            
                            label.appendChild(checkbox);
                            label.appendChild(span);
                            valueField.appendChild(label);
                        });
                    } else if (fieldDef.type === 'object' && (key === 'map' || key === 'outMap')) {
                        // Таблица ключ-значение для map и outMap
                        valueField = document.createElement('div');
                        valueField.className = 'map-table';
                        
                        const addMapRowBtn = document.createElement('button');
                        addMapRowBtn.className = 'toolbar-btn';
                        addMapRowBtn.textContent = 'Добавить строку';
                        addMapRowBtn.style.marginBottom = '10px';
                        
                        const mapTable = document.createElement('div');
                        mapTable.className = 'map-rows';
                        
                        addMapRowBtn.addEventListener('click', () => {
                            const row = document.createElement('div');
                            row.className = 'map-row';
                            
                            const keyInput = document.createElement('input');
                            keyInput.type = 'text';
                            keyInput.placeholder = 'Ключ';
                            keyInput.className = 'map-row-input';
                            
                            const valueInput = document.createElement('input');
                            valueInput.type = 'text';
                            valueInput.placeholder = 'Значение';
                            valueInput.className = 'map-row-input';
                            
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'toolbar-btn map-row-remove-btn';
                            removeBtn.textContent = '×';
                            removeBtn.addEventListener('click', () => row.remove());
                            
                            row.appendChild(keyInput);
                            row.appendChild(valueInput);
                            row.appendChild(removeBtn);
                            mapTable.appendChild(row);
                        });
                        
                        valueField.appendChild(addMapRowBtn);
                        valueField.appendChild(mapTable);
                        
                        // Добавляем первую строку по умолчанию
                        addMapRowBtn.click();
                    } else {
                        // По умолчанию текстовое поле
                        valueField = document.createElement('input');
                        valueField.type = 'text';
                    }
                } else {
                    // Если нет схемы, создаем текстовое поле
                    valueField = document.createElement('input');
                    valueField.type = 'text';
                    
                    // Добавляем немедленное обновление при вводе
                    valueField.addEventListener('input', () => {
                        // Обновляем значение в объекте для предварительного просмотра
                        obj[key] = valueField.value;
                    });
                }
                
                // Добавляем метку "Значение:" с кнопкой подсказки
                const valueLabel = document.createElement('label');
                valueLabel.textContent = 'Значение:';
                valueLabel.className = 'add-field-label';
                
                const valueRow = document.createElement('div');
                valueRow.className = 'form-field-row';
                valueRow.appendChild(valueLabel);
                
                // Добавляем кнопку подсказки для поля
                if (fieldDef && fieldDef.description) {
                    const helpBtn = document.createElement('span');
                    helpBtn.className = 'help-icon add-field-help-icon';
                    helpBtn.textContent = '?';
                    helpBtn.setAttribute('data-tip', fieldDef.description);
                    
                    helpBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.showErrorDialog(key, fieldDef.description, false);
                    });
                    
                    valueRow.appendChild(helpBtn);
                }
                
                valueRow.appendChild(valueField);
                
                // Кнопка "Добавить" для финального добавления поля
                const addFinalBtn = document.createElement('button');
                addFinalBtn.className = 'toolbar-btn';
                addFinalBtn.textContent = 'Добавить';
                
                addFinalBtn.addEventListener('click', () => {
                    // Получаем ключ из поля ввода
                    const key = keyInput.value.trim();
                    if (!key) {
                        console.error('Ключ не может быть пустым');
                        return;
                    }
                    
                    let value;
                    
                    // Получаем значение в зависимости от типа поля
                    if (valueField.className === 'switch-container') {
                        value = valueField.isOn();
                    } else if (valueField.type === 'checkbox') {
                        value = valueField.checked;
                    } else if (valueField.type === 'number') {
                        value = valueField.value === '' ? null : Number(valueField.value);
                    } else if (valueField.tagName === 'SELECT') {
                        value = valueField.value;
                    } else if (valueField.combobox) {
                        // Для combobox полей получаем значение через combobox
                        value = valueField.combobox.getValue();
                    } else if (valueField.className === 'checkbox-array') {
                        // Собираем значения из чекбоксов
                        const checkboxes = valueField.querySelectorAll('input[type="checkbox"]:checked');
                        value = Array.from(checkboxes).map(cb => cb.value);
                    } else if (valueField.className === 'map-table') {
                        // Собираем значения из таблицы map
                        const rows = valueField.querySelectorAll('.map-row');
                        value = {};
                        rows.forEach(row => {
                            const rowKeyInput = row.querySelector('input:first-child');
                            const rowValueInput = row.querySelector('input:nth-child(2)');
                            if (rowKeyInput.value.trim() && rowValueInput.value.trim()) {
                                value[rowKeyInput.value.trim()] = rowValueInput.value.trim();
                            }
                        });
                    } else {
                        value = valueField.value;
                        // Попытка привести к числу/boolean/JSON
                        if (value === 'true' || value === 'false') {
                            value = (value === 'true');
                        } else if (/^\d+(\.\d+)?$/.test(value)) {
                            value = Number(value);
                        } else {
                            try {
                                value = JSON.parse(value);
                            } catch {
                                // Оставляем как строку
                            }
                        }
                    }
                    
    
    
                    
                    // Добавляем поле в объект
                    if (path === 'root') {
                        // Для root объекта вставляем поле в начало, перед init/services/options
                        const newObj = {};
                        newObj[key] = value;
                        
                        // Добавляем все существующие поля
                        Object.keys(obj).forEach(existingKey => {
                            newObj[existingKey] = obj[existingKey];
                        });
                        
                        // Заменяем объект
                        Object.keys(obj).forEach(existingKey => {
                            delete obj[existingKey];
                        });
                        Object.assign(obj, newObj);
                        
                        console.log('Поле добавлено в начало root объекта:', obj);
                    } else {
                        // Для других объектов просто добавляем поле
                        obj[key] = value;
                    }
                    
                    // Отладочная информация
                    console.log('Добавлено поле:', key, 'со значением:', value);
                    console.log('Объект после добавления:', obj);
                    console.log('Текущий root:', window.currentTemplateRoot);
                    
                    // Дополнительная проверка для root объекта
                    if (path === 'root' && window.currentTemplateRoot) {
                        // Убеждаемся, что root объект обновлен
                        window.currentTemplateRoot[key] = value;
                        console.log('Root объект обновлен напрямую:', window.currentTemplateRoot);
                    }
                    
    
    
                    
                    // Обновляем JSON в редакторе
                    try {
                        // Убеждаемся, что currentTemplateRoot обновлен
                        if (window.currentTemplateRoot) {
                            // Если мы добавляем в root объект, обновляем его
                            if (path === 'root') {
                                // Обновляем root объект
                                window.currentTemplateRoot[key] = value;
                                console.log('Root объект обновлен:', window.currentTemplateRoot);
                            }
                            setJsonSafe(window.currentTemplateRoot);
                        } else {
                            console.error('currentTemplateRoot не найден');
                        }
                    } catch (error) {
                        console.error('Ошибка при обновлении JSON:', error);
                    }
                    
                    // Закрываем интерфейс добавления
                    addInterface.remove();
                    
                    // Обновляем форму
                    try {
                        window.renderFormEditor();
                        // Обновляем подсветку ошибок в форме
                        setTimeout(() => {
                            try {
                                if (window.validateJsonInternal) {
                                    const result = window.validateJsonInternal(true, true);
                                    if (result && result.errors) {
                                        const map = mapErrorsToPaths(result.errors);
                                        applyValidationToForm(map);
                                    }
                                }
                            } catch(_) {}
                        }, 100);
                    } catch(_) {}
                });
                
                valueRow.appendChild(addFinalBtn);
                valueContainer.appendChild(valueRow);
                
                // Фокус на поле значения
                if (valueField.focus && valueField.type !== 'checkbox') {
                    valueField.focus();
                }
            });
            
            // Кнопка отмены
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'toolbar-btn';
            cancelBtn.textContent = 'Отмена';
            cancelBtn.style.marginTop = '10px';
            cancelBtn.style.display = 'block';
            
            cancelBtn.addEventListener('click', () => {
                addInterface.remove();
                addBtn.style.display = 'block';
            });
            
            addInterface.appendChild(cancelBtn);
            container.appendChild(addInterface);
            
            // Обработчик потери фокуса для очистки интерфейса
            addInterface.addEventListener('focusout', (e) => {
                // Проверяем, что фокус не перешел на другой элемент интерфейса
                if (!addInterface.contains(e.relatedTarget)) {
                    // Можно добавить дополнительную логику здесь при необходимости
                }
            });
            
            // Фокус на поле ключа
            keyInput.focus();
        });
        
        addRow.appendChild(addBtn);
        return addRow;
    }

    function setJsonSafe(obj){
        try { 
            window.editor.setValue(JSON.stringify(obj, null, 2)); 
            window.editor.refresh(); 
        } catch(e){
            console.error('Ошибка в setJsonSafe:', e);
        }
    }

    function buildKVRow(container, obj, key, schemaDef, path){
        const row = document.createElement('div');
        row.className = 'form-field-row';

        // Заголовок поля + подсказка справа
        const header = document.createElement('div');
        header.className = 'form-field-header';
        const label = document.createElement('label');
        label.textContent = key;
        header.appendChild(label);
        // Всегда показываем кружок подсказки, даже если нет описания — на будущее
        const tip = document.createElement('span');
        tip.className = 'help-icon';
        tip.textContent = '?';
        // Попытка взять подсказку из FIELD_TIPS в editor.js
        let desc = '';
        try {
            // Ключи для соответствия: template.*, service.*, char.*, option.*, link.*
            const keyPath = (path || '').replace(/^root\.?/, '');
            const base = keyPath ? keyPath + '.' + key : key;
            let candidates = [];
            if (/^services\.\d+\.characteristics/.test(keyPath)) {
                candidates = [ `char.${key}` ];
            } else if (/^services\./.test(keyPath)) {
                candidates = [ `service.${key}` ];
            } else if (/^options\./.test(keyPath)) {
                candidates = [ `option.${key}`, `options.${key}` ];
            } else if (/link(\.|$)/.test(keyPath) || key === 'link') {
                candidates = [ `link.${key}` ];
            } else {
                candidates = [ `template.${key}` ];
            }
            const getTip = (k) => (window && window.__FIELD_TIPS__ && window.__FIELD_TIPS__[k]) ? String(window.__FIELD_TIPS__[k]) : '';
            for (const c of candidates) { desc = getTip(c); if (desc) break; }
        } catch(_) {}
        if (!desc && schemaDef && schemaDef.description) desc = String(schemaDef.description);
        tip.setAttribute('data-tip', desc || '');
        
        // Добавляем обработчик клика для всех подсказок полей
        if (desc) {
            tip.style.cursor = 'pointer';
            tip.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.showErrorDialog(key, desc, false); // false = информационное сообщение
            });
        }
        
        header.appendChild(tip);
        row.appendChild(header);

        const inputWrap = document.createElement('div');
        inputWrap.className = 'input-wrapper';
        inputWrap.style.display = 'flex';
        inputWrap.style.alignItems = 'center';
        inputWrap.style.gap = '6px';

        const value = obj[key];
        const type = (schemaDef && schemaDef.type) || (Array.isArray(value)? 'array' : (value===null? 'null' : typeof value));

        let fieldEl = null;
        let updater = null;

        function setAndSync(val){
            obj[key] = val;
            
            // Убеждаемся, что window.currentTemplateRoot обновлен
            if (window.currentTemplateRoot) {
                // Обновляем значение в корневом объекте
                if (path === 'root' || path === '') {
                    // Для корневого объекта обновляем напрямую
                    window.currentTemplateRoot[key] = val;
                } else {
                    // Для вложенных объектов ищем по пути
                    const pathParts = path.split('.');
                    let currentObj = window.currentTemplateRoot;
                    
                    // Проходим по пути до нужного объекта
                    for (let i = 0; i < pathParts.length; i++) {
                        const part = pathParts[i];
                        if (currentObj[part] !== undefined) {
                            currentObj = currentObj[part];
                        } else {
                            break;
                        }
                    }
                    
                    // Обновляем значение в корневом объекте
                    if (currentObj && currentObj === obj) {
                        // Объект найден в корневом объекте
                    } else {
                        // Если объект не найден, обновляем напрямую
                        if (path) {
                            const pathParts = path.split('.');
                            let currentObj = window.currentTemplateRoot;
                            
                            for (let i = 0; i < pathParts.length - 1; i++) {
                                const part = pathParts[i];
                                if (currentObj[part] !== undefined) {
                                    currentObj = currentObj[part];
                                }
                            }
                            
                            const lastPart = pathParts[pathParts.length - 1];
                            if (currentObj && currentObj[lastPart]) {
                                currentObj[lastPart][key] = val;
                            }
                        }
                    }
                }
            }
            
            setJsonSafe(window.currentTemplateRoot);
            
            // автообновить подсветку валидации
            try{ 
                window.validateJsonInternal(true, true);
                
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(e) {
                        console.error('Ошибка при обновлении валидации:', e);
                    }
                }, 100);
            } catch(e) {
                console.error('Ошибка при вызове validateJsonInternal:', e);
            }
        }

        if (schemaDef && Array.isArray(schemaDef.enum) && schemaDef.enum.length){
            // Используем combobox для enum
            // Для поля type у сервиса не раскрываем список автоматически
            const isServiceTypeField = path.includes('services.') && key === 'type';
            const shouldAutoOpen = !isServiceTypeField;
            
            const combobox = window.createCombobox(
                schemaDef.enum.map(v => String(v)),
                'Выберите значение...',
                (selectedKey) => {
                    setAndSync(selectedKey);
                },
                (inputValue) => {
                    // При вводе текста сразу обновляем значение
                    setAndSync(inputValue);
                },
                false // autoOpen: отключен для всех combobox в форме
            );
            
            // Устанавливаем текущее значение
            combobox.setValue((value ?? schemaDef.enum[0]).toString());
            
            fieldEl = combobox.container;
        } else if (type === 'boolean') {
            // Создаем красивый switch для boolean полей
            const switchContainer = document.createElement('div');
            switchContainer.className = 'switch-container';
            
            const switchEl = document.createElement('div');
            switchEl.className = 'switch';
            if (Boolean(value)) {
                switchEl.classList.add('active');
            }
            
            const switchSlider = document.createElement('div');
            switchSlider.className = 'switch-slider';
            switchEl.appendChild(switchSlider);
            
            const switchValue = document.createElement('span');
            switchValue.className = 'switch-value';
            switchValue.textContent = Boolean(value) ? 'ВКЛ' : 'ВЫКЛ';
            
            // Обработчик клика по switch
            switchEl.addEventListener('click', () => {
                // Получаем текущее значение из объекта при каждом клике
                const currentValue = Boolean(obj[key]);
                const newValue = !currentValue;
                
                // Обновляем UI
                switchEl.classList.toggle('active', newValue);
                switchValue.textContent = newValue ? 'ВКЛ' : 'ВЫКЛ';
                
                // Обновляем значение в объекте
                setAndSync(newValue);
            });
            
            switchContainer.appendChild(switchEl);
            switchContainer.appendChild(switchValue);
            
            fieldEl = switchContainer;
        } else if (type === 'number' || type === 'integer') {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = (value ?? '').toString();
            input.addEventListener('input', ()=>{
                const n = input.value === '' ? null : Number(input.value);
                setAndSync(n);
            });
            fieldEl = input;
        } else if (type === 'array' || Array.isArray(value)) {
            // Для characteristics, link, services, options, init - не создаем поля вообще
            if (key === 'characteristics' || key === 'link' || key === 'services' || key === 'options' || key === 'init') {
                // Возвращаем null, чтобы поле не создавалось
                return null;
            } else if (key === 'modelIds' || key === 'manufacturerIds' || (schemaDef && schemaDef.items && schemaDef.items.type === 'string')) {
                // Для массивов строк создаем специальный интерфейс
                const arrayContainer = document.createElement('div');
                arrayContainer.className = 'string-array-container';
                
                // Показываем существующие элементы
                if (Array.isArray(value) && value.length > 0) {
                    value.forEach((item, index) => {
                        const itemRow = document.createElement('div');
                        itemRow.className = 'array-item-row';
                        
                        const itemInput = document.createElement('input');
                        itemInput.type = 'text';
                        itemInput.value = item || '';
                        itemInput.className = 'array-item-input';
                        
                        // Обработчик изменения значения
                        itemInput.addEventListener('input', () => {
                            const newValue = itemInput.value.trim();
                            if (newValue !== item) {
                                obj[key][index] = newValue;
                                setAndSync(obj[key]);
                            }
                        });
                        
                        // Кнопка удаления элемента
                        const removeBtn = document.createElement('button');
                        removeBtn.type = 'button';
                        removeBtn.className = 'array-item-remove-btn';
                        removeBtn.textContent = '×';
                        
                        removeBtn.addEventListener('click', () => {
                            obj[key].splice(index, 1);
                            setAndSync(obj[key]);
                            // Перерисовываем форму для обновления отображения
                            setTimeout(() => {
                                try {
                                    window.renderFormEditor();
                                } catch(_) {}
                            }, 100);
                        });
                        
                        itemRow.appendChild(itemInput);
                        itemRow.appendChild(removeBtn);
                        arrayContainer.appendChild(itemRow);
                    });
                }
                
                // Кнопка добавления нового элемента
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'array-add-btn';
                addBtn.textContent = 'Добавить элемент';
                
                addBtn.addEventListener('click', () => {
                    if (!Array.isArray(obj[key])) {
                        obj[key] = [];
                    }
                    obj[key].push('');
                    setAndSync(obj[key]);
                    // Перерисовываем форму для обновления отображения
                    setTimeout(() => {
                        try {
                            window.renderFormEditor();
                        } catch(_) {}
                    }, 100);
                });
                
                arrayContainer.appendChild(addBtn);
                fieldEl = arrayContainer;
            } else {
                // Для других массивов показываем поле
                fieldEl = document.createElement('div');
                fieldEl.className = 'hidden-field';
            }
        } else if (type === 'object' || (value && typeof value === 'object')) {
            // Удаляем кнопку "Открыть объект" (не требуется)
            fieldEl = document.createElement('div');
            fieldEl.className = 'hidden-field';
        } else {
            // string or unknown; приводим тип согласно схеме при наличии
            const input = document.createElement('input');
            input.type = 'text';
            input.value = (value ?? '').toString();
            // enum подсказки через combobox
            if (schemaDef && Array.isArray(schemaDef.enum) && schemaDef.enum.length){
                // Заменяем input на combobox для enum полей
                // Для поля type у сервиса не раскрываем список автоматически
                const isServiceTypeField = path.includes('services.') && key === 'type';
                const shouldAutoOpen = !isServiceTypeField;
                
                const combobox = window.createCombobox(
                    schemaDef.enum.map(v => String(v)),
                    'Введите или выберите значение...',
                    (selectedValue) => {
                        setAndSync(selectedValue);
                    },
                    (inputValue) => {
                        // При вводе текста сразу обновляем значение
                        setAndSync(inputValue);
                    },
                    false // autoOpen: отключен для всех combobox в форме
                );
                
                // Устанавливаем текущее значение
                combobox.setValue((value ?? '').toString());
                
                fieldEl = combobox.container;
            } else {
                // Для полей без enum используем обычный input
                input.addEventListener('input', ()=> {
                    let v = input.value;
                    if (schemaDef && (schemaDef.type === 'number' || schemaDef.type === 'integer')) {
                        v = v === '' ? null : Number(v);
                    } else if (schemaDef && schemaDef.type === 'boolean') {
                        v = (v === 'true');
                    }
                    setAndSync(v);
                });
                fieldEl = input;
            }
        }

        // Ошибки — справа кружок
        const errorBadge = document.createElement('span');
        errorBadge.className = 'error-badge';
        errorBadge.textContent = '!';
        errorBadge.style.display = 'none';
        inputWrap.appendChild(fieldEl);
        inputWrap.appendChild(errorBadge);

        row.appendChild(inputWrap);
        // подсказка уже в header

        // Правые кнопки добавления для специальных полей
        const rightActions = document.createElement('div');
        rightActions.style.display = 'flex'; rightActions.style.gap='6px';
        function parseServiceIndexFromPath(p){ const m = p.match(/services\.(\d+)/); return m? parseInt(m[1],10) : null; }
        function parseCharIndexFromPath(p){ const m = p.match(/characteristics\.(\d+)/); return m? parseInt(m[1],10) : null; }
        // Кнопки справа для верхних массивов не показываем (будут на заголовках секций)
        // Убираем кнопки "Добавить" для characteristics и link - они будут в заголовках секций
        if (rightActions.childElementCount){ row.appendChild(rightActions); }

        container.appendChild(row);

        // Добавляем обработчик фокуса для обновления cursor map
        const fieldPath = path ? (path + '.' + key) : key;
        addFocusHandlerToField(fieldEl, fieldPath);

        // Вернём возможность подсвечивать
        return { fieldEl, errorBadge };
    }

    // Функция для обновления cursor map при работе с формой
    window.updateCursorMapForForm = function() {
        try {
            // Находим активное поле формы
            const activeElement = document.activeElement;
            if (activeElement && activeElement.closest('.form-field-row')) {
                const fieldRow = activeElement.closest('.form-field-row');
                const label = fieldRow.querySelector('label');
                if (label) {
                    const key = label.textContent || '';
                    const pathEl = fieldRow.closest('[data-path]');
                    const basePath = pathEl ? pathEl.getAttribute('data-path') : '';
                    const fullPath = basePath ? (basePath + '.' + key) : '';
                    
                    // Эмулируем позицию курсора для существующей функции updateCursorPathMap
                    if (window.updateCursorPathMap && fullPath) {
                        const mockCursor = createMockCursorFromPath(fullPath);
                        if (mockCursor) {
                            // Временно сохраняем текущую позицию
                            const originalCursor = window.lastCursorPosition;
                            // Устанавливаем эмулированную позицию
                            window.lastCursorPosition = mockCursor;
                            // Вызываем существующую функцию
                            window.updateCursorPathMap();
                            // Восстанавливаем оригинальную позицию
                            window.lastCursorPosition = originalCursor;
                        }
                    }
                    
                    // Сохраняем текущий путь для формы
                    window.currentFormCursorPath = fullPath;
                }
            }
        } catch (e) {
            console.warn('Ошибка обновления cursor map для формы:', e);
        }
    };

    // Функция для обновления cursor map по конкретному пути
    window.updateCursorMapForPath = function(path) {
        try {
            // Преобразуем путь в формат для cursor map
            const pathParts = path.split('.');
            const cursorMap = [];
            
            let currentPath = '';
            pathParts.forEach((part, index) => {
                if (index === 0) {
                    currentPath = part;
                        } else {
                    currentPath += '.' + part;
                }
                
                cursorMap.push({
                    key: part,
                    path: currentPath,
                    type: 'field'
                });
            });
            
            // Обновляем глобальную переменную cursor map
            if (window.currentJsonCursorPath) {
                window.currentJsonCursorPath = cursorMap;
            }
            
            // Обновляем отображение cursor path, если он есть
            const cursorPathElement = document.querySelector('.cursor-path');
            if (cursorPathElement) {
                cursorPathElement.innerHTML = '';
                cursorMap.forEach((part, index) => {
                    const span = document.createElement('span');
                    span.textContent = part.key;
                    span.style.cursor = 'pointer';
                    span.style.padding = '6px 8px';
                    span.style.margin = '0 2px';
                    span.style.borderRadius = '6px';
                    span.style.transition = 'background-color 0.2s ease';
                    
                    // Добавляем hover эффект
                    span.addEventListener('mouseenter', () => {
                        span.style.backgroundColor = 'var(--cm-selection)';
                    });
                    span.addEventListener('mouseleave', () => {
                        span.style.backgroundColor = 'transparent';
                    });
                    
                    span.addEventListener('click', () => {
                        // При клике на часть пути можно добавить навигацию
                    });
                    cursorPathElement.appendChild(span);
                    
                    if (index < cursorMap.length - 1) {
                        const separator = document.createElement('span');
                        separator.textContent = ' › ';
                        separator.style.margin = '0 8px';
                        separator.style.opacity = '0.6';
                        cursorPathElement.appendChild(separator);
                    }
                });
            }
            
            // Также обновляем отображение в форме, если она активна
            if (window.currentFormCursorPath) {
                window.currentFormCursorPath = cursorMap;
            }
        } catch (e) {
            console.warn('Ошибка обновления cursor map по пути:', e);
        }
    };



    // Вспомогательная функция для добавления обработчика фокуса к полю
    function addFocusHandlerToField(fieldEl, path) {
        if (fieldEl && (fieldEl.tagName === 'INPUT' || fieldEl.tagName === 'SELECT' || fieldEl.tagName === 'TEXTAREA')) {
            fieldEl.addEventListener('focus', () => {
                // Эмулируем позицию курсора для существующей функции updateCursorPathMap
                if (window.updateCursorPathMap && path) {
                    // Создаем эмуляцию позиции курсора на основе пути
                    const mockCursor = createMockCursorFromPath(path);
                    if (mockCursor) {
                        // Временно сохраняем текущую позицию
                        const originalCursor = window.lastCursorPosition;
                        // Устанавливаем эмулированную позицию
                        window.lastCursorPosition = mockCursor;
                        // Вызываем существующую функцию
                        window.updateCursorPathMap();
                        // Восстанавливаем оригинальную позицию
                        window.lastCursorPosition = originalCursor;
                    }
                }
            });
        }
    }

    // Функция для создания эмулированной позиции курсора на основе пути
    function createMockCursorFromPath(path) {
        try {
            const json = window.currentTemplateRoot;
            if (!json) {
                return null;
            }
            
            // Преобразуем путь в координаты курсора
            const pathParts = path.split('.');
            let currentLine = 0;
            let currentCh = 0;
            
            // Ищем позицию в JSON на основе пути
            for (let i = 0; i < pathParts.length; i++) {
                const key = pathParts[i];
                
                if (key === 'services' && typeof pathParts[i + 1] === 'number') {
                    const idx = parseInt(pathParts[i + 1]);
                    // Ищем строку с services, учитывая контекст
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        if (lines[lineNum].includes('"services"')) {
                            // Проверяем контекст - ищем root выше
                            let contextMatch = true;
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 5); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            currentLine = lineNum;
                            currentCh = lines[lineNum].indexOf('"services"');
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Fallback - первое вхождение
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            if (lines[lineNum].includes('"services"')) {
                                currentLine = lineNum;
                                currentCh = lines[lineNum].indexOf('"services"');
                                break;
                            }
                        }
                    }
                    i++; // Пропускаем индекс
                } else if (key === 'characteristics' && typeof pathParts[i + 1] === 'number') {
                    const idx = parseInt(pathParts[i + 1]);
                    // Ищем строку с characteristics, учитывая контекст
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        if (lines[lineNum].includes('"characteristics"')) {
                            // Проверяем контекст - ищем services выше
                            let contextMatch = true;
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 10); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            currentLine = lineNum;
                            currentCh = lines[lineNum].indexOf('"characteristics"');
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Fallback - первое вхождение
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            if (lines[lineNum].includes('"characteristics"')) {
                                currentLine = lineNum;
                                currentCh = lines[lineNum].indexOf('"characteristics"');
                                break;
                            }
                        }
                    }
                    i++; // Пропускаем индекс
                } else if (key === 'link' && typeof pathParts[i + 1] === 'number') {
                    const idx = parseInt(pathParts[i + 1]);
                    // Ищем строку с link, учитывая контекст
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        if (lines[lineNum].includes('"link"')) {
                            // Проверяем контекст - ищем characteristics выше
                            let contextMatch = true;
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 10); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            currentLine = lineNum;
                            currentCh = lines[lineNum].indexOf('"link"');
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Fallback - первое вхождение
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            if (lines[lineNum].includes('"link"')) {
                                currentLine = lineNum;
                                currentCh = lines[lineNum].indexOf('"link"');
                                break;
                            }
                        }
                    }
                    i++; // Пропускаем индекс
                } else if (key === 'init') {
                    // Ищем строку с init, учитывая контекст
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        if (lines[lineNum].includes('"init"')) {
                            // Проверяем контекст - ищем root выше
                            let contextMatch = true;
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 5); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            currentLine = lineNum;
                            currentCh = lines[lineNum].indexOf('"init"');
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Fallback - первое вхождение
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            if (lines[lineNum].includes('"init"')) {
                                currentLine = lineNum;
                                currentCh = lines[lineNum].indexOf('"init"');
                                break;
                            }
                        }
                    }
                } else if (key === 'options' && typeof pathParts[i + 1] === 'number') {
                    const idx = parseInt(pathParts[i + 1]);
                    // Ищем строку с options, учитывая контекст
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        if (lines[lineNum].includes('"options"')) {
                            // Проверяем контекст - ищем root выше
                            let contextMatch = true;
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 5); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            currentLine = lineNum;
                            currentCh = lines[lineNum].indexOf('"options"');
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Fallback - первое вхождение
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            if (lines[lineNum].includes('"options"')) {
                                currentLine = lineNum;
                                currentCh = lines[lineNum].indexOf('"options"');
                                break;
                            }
                        }
                    }
                    i++; // Пропускаем индекс
                } else {
                    // Для обычных полей ищем по ключу
                    const jsonStr = JSON.stringify(json, null, 2);
                    const lines = jsonStr.split('\n');
                    
                    // Ищем позицию поля, учитывая контекст пути
                    let found = false;
                    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                        const line = lines[lineNum];
                        if (line.includes(`"${key}"`)) {
                            // Проверяем, что это именно то поле, которое нам нужно
                            // Ищем в контексте текущего пути
                            let contextMatch = true;
                            
                            // Если у нас есть предыдущие части пути, проверяем контекст
                            if (i > 0) {
                                const prevKey = pathParts[i - 1];
                                // Ищем строки выше, которые содержат предыдущий ключ
                                let prevKeyFound = false;
                                for (let j = lineNum - 1; j >= Math.max(0, lineNum - 10); j--) {
                                    if (lines[j] && lines[j].includes(`"${prevKey}"`)) {
                                        prevKeyFound = true;
                                        break;
                                    }
                                }
                                // Если предыдущий ключ не найден вблизи, это может быть не то поле
                                if (!prevKeyFound) {
                                    continue;
                                }
                            }
                            
                            // Дополнительная проверка: убеждаемся, что это именно поле, а не начало объекта
                            // Ищем двоеточие после ключа, что означает, что это поле
                            const keyIndex = line.indexOf(`"${key}"`);
                            const afterKey = line.substring(keyIndex + key.length + 2); // +2 для пропуска кавычек
                            if (afterKey.trim().startsWith(':')) {
                                currentLine = lineNum;
                                currentCh = keyIndex;
                                found = true;
                                break;
                            }
                        }
                    }
                    
                    // Если не нашли с учетом контекста, берем первое вхождение
                    if (!found) {
                        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                            const line = lines[lineNum];
                            if (line.includes(`"${key}"`)) {
                                const keyIndex = line.indexOf(`"${key}"`);
                                const afterKey = line.substring(keyIndex + key.length + 2);
                                if (afterKey.trim().startsWith(':')) {
                                    currentLine = lineNum;
                                    currentCh = keyIndex;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            return { line: currentLine, ch: currentCh };
        } catch (e) {
            console.warn('Ошибка создания эмулированной позиции курсора:', e);
            return null;
        }
    }

    function getSchemaForChild(schemaNode, key){
        if (!schemaNode) return null;
        const props = schemaNode.properties || schemaNode;
        return props ? (props[key] || null) : null;
    }

    // Пул ярких классов рамок
    const BORDER_CLASSES = ['fs-obj-1','fs-obj-2','fs-obj-3','fs-obj-4','fs-obj-5','fs-obj-6'];

    function nextBorderClass(level){
        return BORDER_CLASSES[level % BORDER_CLASSES.length];
    }

    function renderArray(container, arr, itemSchema, path, level=0){
        const p = (path||'').replace(/^root\./,'');
        const isTopLevel = /^(services|options|init)$/.test(p) && !p.includes('.');
        
        // Создаем заголовок массива (если это не верхний уровень)
        if (!isTopLevel) {
            const arrayHeader = document.createElement('div');
            arrayHeader.className = 'form-section-title';
            arrayHeader.style.cursor = 'pointer';
            arrayHeader.style.userSelect = 'none';
            
            // Кнопка сворачивания
            const collapseBtn = document.createElement('span');
            collapseBtn.className = 'collapse-btn';
            collapseBtn.textContent = '▼';
            collapseBtn.style.marginRight = '8px';
            collapseBtn.style.transition = 'transform 0.2s';
            arrayHeader.appendChild(collapseBtn);
            
            const titleText = document.createElement('span');
            titleText.className = 'title-text';
            // Заголовки для массивов
            if (/^services$/.test(p)) titleText.textContent = 'Сервисы (service)';
            else if (/^options$/.test(p)) titleText.textContent = 'Опции (options)';
            else if (/^init$/.test(p)) titleText.textContent = 'Инициализация (init)';
            else if (/characteristics$/.test(p)) titleText.textContent = 'Характеристики (characteristics)';
            else if (/link$/.test(p)) titleText.textContent = 'Линки (link)';
            else if (/^services\.\d+\.characteristics$/.test(p)) titleText.textContent = 'Характеристики (characteristics)';
            else if (/^services\.\d+\.characteristics\.\d+\.link$/.test(p)) titleText.textContent = 'Линки (link)';
            else titleText.textContent = p || 'Массив';
            arrayHeader.appendChild(titleText);
            
            // Обработчик сворачивания будет добавлен после создания arraySection
            
            // Добавляем кнопки для characteristics и link
            if (/^services\.\d+\.characteristics$/.test(p)) {
                const addCharBtn = document.createElement('button'); 
                addCharBtn.type = 'button';
                addCharBtn.className='array-add-btn array-add-btn-right'; 
                addCharBtn.textContent='Добавить характеристику';
                addCharBtn.addEventListener('click', (e)=>{
                    e.stopPropagation(); // Предотвращаем сворачивание при клике на кнопку
                    try {
                                            // Обновляем cursor map перед добавлением характеристики
                    if (window.updateCursorPathMap) {
                        // Получаем путь для текущего сервиса
                        const svcIdx = path.match(/services\.(\d+)/)?.[1];
                        if (svcIdx !== undefined) {
                            const servicePath = `root.services.${svcIdx}.characteristics`;
                            // Эмулируем позицию курсора для существующей функции updateCursorPathMap
                            const mockCursor = createMockCursorFromPath(servicePath);
                            if (mockCursor) {
                                // Временно сохраняем текущую позицию
                                const originalCursor = window.lastCursorPosition;
                                // Устанавливаем эмулированную позицию
                                window.lastCursorPosition = mockCursor;
                                // Вызываем существующую функцию
                                window.updateCursorPathMap();
                                // Восстанавливаем оригинальную позицию
                                window.lastCursorPosition = originalCursor;
                            }
                        }
                    }
                        
                        const json = getJsonSafe();
                        const svcIdx = path.match(/services\.(\d+)/)?.[1];
                        if (svcIdx !== undefined && json.services && json.services[svcIdx]) {
                            const svc = json.services[svcIdx];
                            if (window.showCharacteristicSelectDialog){
                                window.showCharacteristicSelectDialog(svc, function(chars){ 
                                    if(!Array.isArray(chars)||!chars.length) return; 
                                    if(!Array.isArray(svc.characteristics)) svc.characteristics=[]; 
                                    chars.forEach(ch=>{ svc.characteristics.push({ type: ch.type||'', link: [{}] }); }); 
                                    setJsonSafe(json); 
                                    window.renderFormEditor();
                                    // Обновляем подсветку ошибок в форме
                                    setTimeout(() => {
                                        try {
                                            if (window.validateJsonInternal) {
                                                const result = window.validateJsonInternal(true, true);
                                                if (result && result.errors) {
                                                    const map = mapErrorsToPaths(result.errors);
                                                    applyValidationToForm(map);
                                                }
                                            }
                                        } catch(_) {}
                                    }, 100); 
                                });
                            }
                        }
                    } catch(_){ }
                });
                arrayHeader.appendChild(addCharBtn);
            } else if (/^services\.\d+\.characteristics\.\d+\.link$/.test(p)) {
                const addLinkBtn = document.createElement('button'); 
                addLinkBtn.type = 'button';
                addLinkBtn.className='array-add-btn array-add-btn-right'; 
                addLinkBtn.textContent='Добавить линк';
                addLinkBtn.addEventListener('click', (e)=>{
                    e.stopPropagation(); // Предотвращаем сворачивание при клике на кнопку
                    try {
                        const json = getJsonSafe();
                        const svcIdx = path.match(/services\.(\d+)/)?.[1];
                        const chIdx = path.match(/characteristics\.(\d+)/)?.[1];
                        if (svcIdx !== undefined && chIdx !== undefined && json.services && json.services[svcIdx] && json.services[svcIdx].characteristics) {
                            const svc = json.services[svcIdx];
                            const ch = svc.characteristics[chIdx];
                            if (typeof window.startWizardAddLink === 'function'){
                                window.startWizardAddLink(svc.type, ch.type, function(links){ 
                                    if(!Array.isArray(links)||!links.length) return; 
                                    if(!Array.isArray(ch.link)) ch.link=[]; 
                                    ch.link.push(...links); 
                                    setJsonSafe(json); 
                                    window.renderFormEditor();
                                    // Обновляем подсветку ошибок в форме
                                    setTimeout(() => {
                                        try {
                                            if (window.validateJsonInternal) {
                                                const result = window.validateJsonInternal(true, true);
                                                if (result && result.errors) {
                                                    const map = mapErrorsToPaths(result.errors);
                                                    applyValidationToForm(map);
                                                }
                                            }
                                        } catch(_) {}
                                    }, 100); 
                                });
                } else {
                                if (!Array.isArray(ch.link)) ch.link = [];
                                ch.link.push({ type: '' });
                                setJsonSafe(json); 
                                window.renderFormEditor();
                                // Обновляем подсветку ошибок в форме
                                setTimeout(() => {
                                    try {
                                        if (window.validateJsonInternal) {
                                            const result = window.validateJsonInternal(true, true);
                                            if (result && result.errors) {
                                                const map = mapErrorsToPaths(result.errors);
                                                applyValidationToForm(map);
                                            }
                                        }
                                    } catch(_) {}
                                }, 100);
                            }
                        }
                    } catch(_){ }
                });
                arrayHeader.appendChild(addLinkBtn);
            }
            
            // Добавляем заголовок массива в контейнер
            container.appendChild(arrayHeader);
        }
        
        // Создаем отдельный блок для элементов массива
        const arraySection = document.createElement('div');
        arraySection.className = 'form-section ' + nextBorderClass(level);
        arraySection.setAttribute('data-path', path);
        
        // Добавляем обработчик сворачивания для заголовка массива (если есть заголовок)
        if (!isTopLevel) {
            const arrayHeader = container.querySelector('.form-section-title:last-child');
            if (arrayHeader) {
                const collapseBtn = arrayHeader.querySelector('.collapse-btn');
                if (collapseBtn) {
                    const arrayPath = path;
                    let arrayIsCollapsed = isSectionCollapsed(arrayPath);
                    
                    // Применяем сохраненное состояние
                    if (arrayIsCollapsed) {
                        arraySection.style.display = 'none';
                        collapseBtn.style.transform = 'rotate(-90deg)';
                    }
                    
                    arrayHeader.addEventListener('click', (e) => {
                        // Проверяем, что клик не по кнопке добавления
                        if (e.target.tagName === 'BUTTON') {
                            return;
                        }
                        
                        arrayIsCollapsed = !arrayIsCollapsed;
                        if (arrayIsCollapsed) {
                            arraySection.style.display = 'none';
                            collapseBtn.style.transform = 'rotate(-90deg)';
                } else {
                            arraySection.style.display = 'block';
                            collapseBtn.style.transform = 'rotate(0deg)';
                        }
                        saveCollapsedState(arrayPath, arrayIsCollapsed);
                    });
                }
            }
        }
        
        // Рендерим элементы массива
            (arr || []).forEach((item, idx)=>{
                const itemPath = path + '.' + idx;
                if (item && typeof item === 'object' && !Array.isArray(item)){
                    // Заголовок элемента массива по типу
                    const elemTitle = document.createElement('div');
                    elemTitle.className = 'form-section-title';
                    elemTitle.style.cursor = 'pointer';
                    elemTitle.style.userSelect = 'none';
                    
                    // Кнопка сворачивания для элемента массива
                    const elemCollapseBtn = document.createElement('span');
                    elemCollapseBtn.className = 'collapse-btn';
                    elemCollapseBtn.textContent = '▼';
                    elemCollapseBtn.style.marginRight = '8px';
                    elemCollapseBtn.style.transition = 'transform 0.2s';
                    elemTitle.appendChild(elemCollapseBtn);
                    
                    const elemTitleText = document.createElement('span');
                elemTitleText.className = 'title-text';
                    if (/services\.$/.test(path+'.')) elemTitleText.textContent = `Сервис ${idx}`; 
                    else if (/characteristics\.$/.test(path+'.')) elemTitleText.textContent = `Характеристика ${idx}`;
                    else if (/link\.$/.test(path+'.')) elemTitleText.textContent = `Линк ${idx}`;
                    else if (/options\.$/.test(path+'.')) elemTitleText.textContent = `Опция ${idx}`;
                    else if (/init\.$/.test(path+'.')) elemTitleText.textContent = `Элемент ${idx}`;
                    else elemTitleText.textContent = `${p}.${idx}`;
                    elemTitle.appendChild(elemTitleText);
                    
                    // Контейнер для содержимого элемента массива
                    const elemContent = document.createElement('div');
                    elemContent.className = 'form-section-content';
                    
                    // Обработчик сворачивания для элемента массива
                const elemPath = itemPath;
                let elemIsCollapsed = isSectionCollapsed(elemPath);
                
                // Применяем сохраненное состояние
                if (elemIsCollapsed) {
                    elemContent.style.display = 'none';
                    elemCollapseBtn.style.transform = 'rotate(-90deg)';
                }
                
                    elemTitle.addEventListener('click', () => {
                        elemIsCollapsed = !elemIsCollapsed;
                        if (elemIsCollapsed) {
                            elemContent.style.display = 'none';
                            elemCollapseBtn.style.transform = 'rotate(-90deg)';
                        } else {
                            elemContent.style.display = 'block';
                            elemCollapseBtn.style.transform = 'rotate(0deg)';
                        }
                    saveCollapsedState(elemPath, elemIsCollapsed);
                    });
                    
                arraySection.appendChild(elemTitle);
                arraySection.appendChild(elemContent);
                    renderObject(elemContent, item, itemSchema, itemPath, level+1, idx);
                

                } else if (Array.isArray(item)){
                renderArray(arraySection, item, itemSchema, itemPath, level+1);
                } else {
                    // primitive
                    const row = document.createElement('div');
                    row.className = 'form-field-row';
                    const label = document.createElement('label');
                    label.textContent = String(idx);
                    row.appendChild(label);
                    const wrap = document.createElement('div');
                    wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='6px';
                    const input = document.createElement('input');
                    const t = typeof item;
                    input.type = (t==='number')? 'number' : 'text';
                    input.value = (item ?? '').toString();
                    input.addEventListener('input', ()=>{
                    const json = window.currentTemplateRoot; 
                    let node = json;
                        const parts = itemPath.replace(/^root\./,'').split('.');
                    for (let i=0;i<parts.length-1;i++){ 
                        const p = parts[i]; 
                        node = Array.isArray(node)? node[+p] : node[p]; 
                        if (node==null) break; 
                    }
                        if (node){
                            let v = input.value;
                            if (input.type==='number') v = v===''? null : Number(v);
                        else if (v==='true'||v==='false') v = (v==='true'); 
                        else if (/^\d+(\.\d+)?$/.test(v)) v = Number(v);
                        node[+parts[parts.length-1]] = v; 
                        setJsonSafe(json); 
                        try{ 
                            window.validateJsonInternal(true,true);
                            // Обновляем подсветку ошибок в форме
                            setTimeout(() => {
                                try {
                                    if (window.validateJsonInternal) {
                                        const result = window.validateJsonInternal(true, true);
                                        if (result && result.errors) {
                                            const map = mapErrorsToPaths(result.errors);
                                            applyValidationToForm(map);
                                        }
                                    }
                                } catch(_) {}
                            }, 100);
                        } catch(_) {}
                    }
                });
                
                // Добавляем обработчик фокуса для обновления cursor map
                addFocusHandlerToField(input, itemPath);
                
                const badge = document.createElement('span'); 
                badge.className='error-badge'; 
                badge.textContent='!'; 
                badge.style.display='none';
                wrap.appendChild(input); 
                wrap.appendChild(badge); 
                row.appendChild(wrap); 
                arraySection.appendChild(row);
            }
        });
        
        // Добавляем блок с элементами массива в контейнер
        container.appendChild(arraySection);
    }

    function renderObject(container, obj, schemaNode, path, level=0, indexInArray=null){
        const section = document.createElement('div');
        let cls = 'form-section ' + nextBorderClass(level);
        section.className = cls;
        section.setAttribute('data-path', path);
        
        // Создаем заголовок только для объектов верхнего уровня
        const p = (path||'').replace(/^root\./,'');
        let shouldCreateTitle = false;
        let titleText = '';
        
        if (p === '') {
            // Root объект - заголовок не нужен
            shouldCreateTitle = false;
        } else if (/^services$/.test(p)) {
            // Только верхний уровень services (без цифр)
            shouldCreateTitle = true;
            titleText = 'Сервисы (service)';
        } else if (/^characteristics$/.test(p)) {
            // Только верхний уровень characteristics (без цифр)
            shouldCreateTitle = true;
            titleText = 'Характеристики (characteristics)';
        } else if (/^options$/.test(p)) {
            // Только верхний уровень options (без цифр)
            shouldCreateTitle = true;
            titleText = 'Опции (options)';
        } else if (/^init$/.test(p)) {
            // Только верхний уровень init (без цифр)
            shouldCreateTitle = true;
            titleText = 'Инициализация (init)';
        } else {
            // Все остальные объекты (включая объекты внутри массивов) - заголовок не нужен
            shouldCreateTitle = false;
        }
        
        // Создаем заголовок только если нужно
        if (shouldCreateTitle) {
        const title = document.createElement('div');
        title.className = 'form-section-title';
            title.textContent = titleText;
        section.appendChild(title);
        }
        
        // Контейнер для содержимого
        const content = document.createElement('div');
        content.className = 'form-section-content';
        section.appendChild(content);

        const props = (schemaNode && schemaNode.properties) ? schemaNode.properties : schemaNode;
        if (props && typeof props === 'object'){
            Object.keys(obj || {}).forEach((key)=>{
                const fieldDef = props[key] || {};
                const fieldResult = buildKVRow(content, obj, key, fieldDef, path);
                
                // Если buildKVRow вернул null, поле не создается
                if (fieldResult === null) {
                    // Для скрытых полей все равно рендерим массивы/объекты
                    const val = obj[key];
                    if (val && typeof val === 'object'){
                        if (Array.isArray(val)){
                            // Для массивов строк (modelIds, manufacturerIds) не рендерим как массив
                            if (key === 'modelIds' || key === 'manufacturerIds' || (fieldDef && fieldDef.items && fieldDef.items.type === 'string')) {
                                // Пропускаем рендеринг массива для строковых массивов
                            } else {
                                const itemSchema = getSchemaForChild(schemaNode, key);
                                renderArray(content, val, itemSchema, path + '.' + key, level+1);
                            }
                        } else {
                            const childSchema = getSchemaForChild(schemaNode, key);
                            renderObject(content, val, childSchema, path + '.' + key, level+1);
                        }
                    }
                    // НЕ возвращаемся, продолжаем рендеринг
                } else {
                    // Если buildKVRow создал поле, то дополнительно рендерим только вложенные объекты/массивы
                    // НО НЕ для массивов строк, которые уже отрендерены в buildKVRow
                    const val = obj[key];
                    if (val && typeof val === 'object' && !(key === 'modelIds' || key === 'manufacturerIds' || (fieldDef && fieldDef.items && fieldDef.items.type === 'string'))){
                        if (Array.isArray(val)){
                            const itemSchema = getSchemaForChild(schemaNode, key);
                            renderArray(content, val, itemSchema, path + '.' + key, level+1);
                        } else {
                            const childSchema = getSchemaForChild(schemaNode, key);
                            renderObject(content, val, childSchema, path + '.' + key, level+1);
                        }
                    }
                }
            });
        } else {
            Object.keys(obj || {}).forEach((key)=>{
                const fieldResult = buildKVRow(content, obj, key, {}, path);
                
                // Если buildKVRow вернул null, поле не создается
                if (fieldResult === null) {
                    // Для скрытых полей все равно рендерим массивы/объекты
                    const val = obj[key];
                    if (val && typeof val === 'object'){
                        if (Array.isArray(val)) {
                            // Для массивов строк (modelIds, manufacturerIds) не рендерим как массив
                            if (key === 'modelIds' || key === 'manufacturerIds') {
                                // Пропускаем рендеринг массива для строковых массивов
                            } else {
                                // Для characteristics и link внутри сервиса/characteristics просто рендерим массив
                                // Заголовки будут созданы в renderArray
                                const servicesSchema = window.schema?.properties?.services?.items?.properties;
                                const keySchema = servicesSchema?.[key]?.items?.properties || window.schemaHintsTree?.services?.[key]?.items?.properties;
                                const arraySchema = getSchemaForChild({properties:{[key]:{items:{properties: keySchema}}}}, key);
                                renderArray(content, val, arraySchema, path + '.' + key, level+1);
                            }
                        } else {
                            const servicesSchema = window.schema?.properties?.services?.items?.properties;
                            const keySchema = servicesSchema?.[key]?.properties || window.schemaHintsTree?.services?.[key]?.properties;
                            const objSchema = getSchemaForChild({properties:{[key]:{properties: keySchema}}}, key);
                            renderObject(content, val, objSchema, path + '.' + key, level+1);
                        }
                    }
                    // НЕ возвращаемся, продолжаем рендеринг
                } else {
                    // Если buildKVRow создал поле, то дополнительно рендерим только вложенные объекты/массивы
                    // НО НЕ для массивов строк, которые уже отрендерены в buildKVRow
                    const val = obj[key];
                    if (val && typeof val === 'object' && !(key === 'modelIds' || key === 'manufacturerIds')){
                        if (Array.isArray(val)) {
                            // Для characteristics и link внутри сервиса/characteristics просто рендерим массив
                            // Заголовки будут созданы в renderArray
                            const servicesSchema = window.schema?.properties?.services?.items?.properties;
                            const keySchema = servicesSchema?.[key]?.items?.properties || window.schemaHintsTree?.services?.[key]?.items?.properties;
                            const arraySchema = getSchemaForChild({properties:{[key]:{items:{properties: keySchema}}}}, key);
                            renderArray(content, val, arraySchema, path + '.' + key, level+1);
                        } else {
                            const servicesSchema = window.schema?.properties?.services?.items?.properties;
                            const keySchema = servicesSchema?.[key]?.properties || window.schemaHintsTree?.services?.[key]?.properties;
                            const objSchema = getSchemaForChild({properties:{[key]:{properties: keySchema}}}, key);
                            renderObject(content, val, objSchema, path + '.' + key, level+1);
                        }
                    }
                }
            });
        }

        // Создаем кнопку "Добавить поле" только для сервисов верхнего уровня и только если есть характеристики
        if (path === 'root.services' && obj.characteristics && !path.includes('.characteristics.') && !path.includes('.link.')) {
            const addRow = createAddFieldInterface(content, obj, schemaNode, path);
            if (addRow) {
                content.appendChild(addRow);
            }
        } else if (path === 'root' || path.includes('options.') || path.includes('init.')) {
            // Для корневого объекта, опций и инициализации создаем кнопку всегда
            const addRow = createAddFieldInterface(content, obj, schemaNode, path);
            if (addRow) {
                content.appendChild(addRow);
            }
        }

        container.appendChild(section);
    }

    function renderServicesButtons(container){
        const row = document.createElement('div');
        row.className = 'form-field-row';
        const lbl = document.createElement('label');
        lbl.textContent = 'services';
        row.appendChild(lbl);
        const actions = document.createElement('div');
        actions.className = 'flex-container';
        const btnService = document.createElement('button');
        btnService.type = 'button';
        btnService.className = 'array-add-btn';
        btnService.textContent = 'Добавить сервис';
        btnService.addEventListener('click', ()=>{
            try { if (window.startWizardAddService) {
                window.startWizardAddService(function(services){
                    if (!Array.isArray(services)||!services.length) return;
                    const json = getJsonSafe(); if (!Array.isArray(json.services)) json.services=[];
                    json.services.push(...services); 
                    setJsonSafe(json); 
                    window.renderFormEditor();
                    // Обновляем подсветку ошибок в форме
                    setTimeout(() => {
                        try {
                            if (window.validateJsonInternal) {
                                const result = window.validateJsonInternal(true, true);
                                if (result && result.errors) {
                                    const map = mapErrorsToPaths(result.errors);
                                    applyValidationToForm(map);
                                }
                            }
                        } catch(_) {}
                    }, 100);
                });
            } else { if (typeof addService==='function') addService(); } } catch(_){ }
        });
        const btnChar = document.createElement('button');
        btnChar.type = 'button';
        btnChar.className = 'array-add-btn';
        btnChar.textContent = 'Добавить характеристику';
        btnChar.addEventListener('click', ()=>{ 
            try { 
                if (typeof addCharacteristic==='function') addCharacteristic(); 
            } catch(_){} 
            setTimeout(()=>{
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            }, 100); 
        });
        const btnOpt = document.createElement('button');
        btnOpt.type = 'button';
        btnOpt.className = 'array-add-btn';
        btnOpt.textContent = 'Добавить опцию';
        btnOpt.addEventListener('click', ()=>{ 
            try { 
                if (typeof addOption==='function') addOption(); 
            } catch(_){} 
            setTimeout(()=>{
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            }, 100); 
        });
        const btnLink = document.createElement('button');
        btnLink.type = 'button';
        btnLink.className = 'array-add-btn';
        btnLink.textContent = 'Добавить линк';
        btnLink.addEventListener('click', ()=>{ 
            try { 
                if (typeof addLink==='function') addLink(); 
            } catch(_){} 
            setTimeout(()=>{
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            }, 100); 
        });
        actions.appendChild(btnService); actions.appendChild(btnChar); actions.appendChild(btnOpt); actions.appendChild(btnLink);
        row.appendChild(actions);
        container.appendChild(row);
    }

    function mapErrorsToPaths(errors){
        const map = new Map();
        
        (errors||[]).forEach(err=>{
            const ptr = (err.instancePath||err.dataPath||'').replace(/^\//,'');
            let path = ptr.split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~')).join('.');
            
            // Привязка к конкретному полю для required/additionalProperties
            try {
                if (err.keyword === 'required' && err.params && err.params.missingProperty) {
                    const miss = String(err.params.missingProperty);
                    path = path ? (path + '.' + miss) : miss;
                }
                if (err.keyword === 'additionalProperties' && err.params && err.params.additionalProperty) {
                    const extra = String(err.params.additionalProperty);
                    path = path ? (path + '.' + extra) : extra;
                }
            } catch(_) {}
            
            // Добавляем ошибку в карту для всех возможных вариантов пути
            // Убираем точку в начале пути, если она есть
            const cleanPath = path.startsWith('.') ? path.substring(1) : path;
            
            // Нормализуем путь: заменяем [0] на .0
            const normalizedPath = cleanPath.replace(/\[(\d+)\]/g, '.$1');
            
            if (!map.has(normalizedPath)) map.set(normalizedPath, []);
            
            // Используем готовую функцию перевода из validation.js
            let msg = err.message || (err.keyword || 'Ошибка');
            
            // Если доступна функция перевода, используем её
            if (window.translateAjvError && window.currentTemplateRoot) {
                try {
                    const translated = window.translateAjvError(err, window.currentTemplateRoot, window.editor ? window.editor.getValue() : '');
                    msg = translated.message || msg;
                } catch(e) {
                    // Если перевод не удался, используем оригинальное сообщение
                    console.warn('Ошибка перевода:', e);
                }
            }
            
            map.get(normalizedPath).push(msg);
            
            // Добавляем ошибку для root пути
            if (normalizedPath && !normalizedPath.includes('.')) {
                const rootPath = 'root.' + normalizedPath;
                if (!map.has(rootPath)) map.set(rootPath, []);
                map.get(rootPath).push(msg);
            }
            
            // Добавляем ошибку для пути с root (если это не root путь)
            if (normalizedPath && normalizedPath !== 'root' && !normalizedPath.startsWith('root.')) {
                const rootPath = 'root.' + normalizedPath;
                if (!map.has(rootPath)) map.set(rootPath, []);
                map.get(rootPath).push(msg);
            }
            
            // Для ошибок в массивах добавляем также путь без индекса
            if (normalizedPath && /\d+/.test(normalizedPath)) {
                const pathWithoutIndex = normalizedPath.replace(/\.\d+\./g, '.').replace(/\.\d+$/, '');
                if (pathWithoutIndex !== normalizedPath) {
                    if (!map.has(pathWithoutIndex)) map.set(pathWithoutIndex, []);
                    map.get(pathWithoutIndex).push(msg);
                }
            }
        });
        
        return map;
    }

    function applyValidationToForm(errorMap){
        const container = document.getElementById('formEditor');
        if (!container) return;
        
        // Сначала очищаем все предыдущие ошибки
        container.querySelectorAll('.error-badge').forEach(badge => {
            badge.style.display = 'none';
            badge.removeAttribute('data-tip');
        });
        container.querySelectorAll('.field-error').forEach(input => {
            input.classList.remove('field-error');
        });
        
        // Проходим по всем полям формы
        container.querySelectorAll('.form-field-row').forEach(row => {
            const label = row.querySelector('label');
            if (!label) return;
            
            const key = label.textContent || '';
            const pathEl = row.closest('[data-path]');
            const basePath = pathEl ? pathEl.getAttribute('data-path') : '';
            const full = basePath ? (basePath + '.' + key) : key;
            
            // Ищем поле ввода (input, select, textarea, switch)
            const input = row.querySelector('input, select, textarea, .switch');
            let badge = row.querySelector('.error-badge');
            
            // Если нет значка ошибки, создаем его
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'error-badge';
                badge.textContent = '!';
                badge.style.display = 'none';
                
                // Вставляем в заголовок поля (рядом с label)
                const header = row.querySelector('.form-field-header') || row;
                header.appendChild(badge);
            }
            
            // Ищем ошибки для этого поля
            const trimmed = full.replace(/^root\./, '');
            
            const msgs = errorMap.get(full) || errorMap.get(trimmed) || errorMap.get(key) || null;
            
            if (msgs && msgs.length) {
                // Подсвечиваем поле с ошибкой
                if (input) {
                    input.classList.add('field-error');
                }
                
                // Показываем значок ошибки с текстом
                badge.style.display = 'inline-flex';
                const errorText = msgs.join('\n');
                badge.setAttribute('data-tip', errorText);
                
                // Добавляем обработчик клика для всех подсказок об ошибках
                badge.style.cursor = 'pointer';
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Скрываем всплывающую подсказку при открытии диалога
                    badge.classList.remove('active');
                    window.showErrorDialog(key, errorText, true); // true = ошибка
                });
            }
        });
        
        // Также проверяем ошибки для заголовков секций (если есть ошибки для массивов)
        container.querySelectorAll('.form-section-title').forEach(header => {
            const pathEl = header.closest('[data-path]');
            if (!pathEl) return;
            
            const path = pathEl.getAttribute('data-path');
            if (!path) return;
            
            const msgs = errorMap.get(path) || errorMap.get(path.replace(/^root\./, ''));
            if (msgs && msgs.length) {
                // Добавляем значок ошибки к заголовку секции
                let badge = header.querySelector('.error-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'error-badge';
                    badge.textContent = '!';
                    badge.style.marginLeft = '8px';
                    header.appendChild(badge);
                }
                badge.style.display = 'inline-flex';
                const errorText = msgs.join('\n');
                badge.setAttribute('data-tip', errorText);
                
                // Добавляем обработчик клика для всех подсказок об ошибках секций
                badge.style.cursor = 'pointer';
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Скрываем всплывающую подсказку при открытии диалога
                    badge.classList.remove('active');
                    // Получаем название секции для заголовка
                    const sectionTitle = header.querySelector('.title-text')?.textContent || path;
                    window.showErrorDialog(sectionTitle, errorText, true); // true = ошибка
                });
            }
        });
    }

    window.renderFormEditor = function(){
        const mount = document.getElementById('formEditor');
        if (!mount) return;
        
        // Загружаем сохраненное состояние свёрнутости при каждом рендере формы
        loadCollapsedState();
        
        mount.innerHTML = '';
        // Убираем старый код фиксации подсказки - теперь используем диалоги
        const json = getJsonSafe();
        window.currentTemplateRoot = json;

        // Инициализируем cursor path для формы
        if (window.updateCursorPathMap) {
            // Эмулируем позицию курсора для root
            const mockCursor = createMockCursorFromPath('root');
            if (mockCursor) {
                // Временно сохраняем текущую позицию
                const originalCursor = window.lastCursorPosition;
                // Устанавливаем эмулированную позицию
                window.lastCursorPosition = mockCursor;
                // Вызываем существующую функцию
                window.updateCursorPathMap();
                // Восстанавливаем оригинальную позицию
                window.lastCursorPosition = originalCursor;
            }
        }

        // Рендер root без заголовка и верхних кнопок
        const hints = window.schemaHintsTree || {};
        // Порядок: обычные поля, затем кнопка Добавить поле, затем блоки init/services/options с собственными заголовками и кнопками
        // 1) Собираем обычные поля рут-объекта
        const rootProps = (hints && hints) || {};
        const special = new Set(['services','options','init']);
        const normalKeys = Object.keys(json || {}).filter(k=>!special.has(k));
        const tempRoot = {};
        normalKeys.forEach(k=> tempRoot[k] = json[k]);
        renderObject(mount, tempRoot, { properties: rootProps }, 'root');
        // 2) Кнопка Добавить поле уже встроена в renderObject
        // 3) Блок init (первым)
        if (json.init && typeof json.init === 'object') {
            const header = document.createElement('div'); 
            header.className='form-section-title clickable';
            
            // Кнопка сворачивания для init
            const initCollapseBtn = document.createElement('span');
            initCollapseBtn.className = 'collapse-btn';
            initCollapseBtn.textContent = '▼';
            // Стили уже применены через CSS класс collapse-btn
            header.appendChild(initCollapseBtn);
            
            const initTitleText = document.createElement('span');
            initTitleText.className = 'title-text';
            initTitleText.textContent = 'Инициализация (init)';
            header.appendChild(initTitleText);
            
            // Контейнер для содержимого init
            const initContent = document.createElement('div');
            initContent.className = 'form-section-content';
            
            // Обработчик сворачивания для init
            const initPath = 'root.init';
            let initIsCollapsed = isSectionCollapsed(initPath);
            
            // Применяем сохраненное состояние
            if (initIsCollapsed) {
                initContent.style.display = 'none';
                initCollapseBtn.style.transform = 'rotate(-90deg)';
            }
            
            header.addEventListener('click', () => {
                initIsCollapsed = !initIsCollapsed;
                if (initIsCollapsed) {
                    initContent.style.display = 'none';
                    initCollapseBtn.style.transform = 'rotate(-90deg)';
                } else {
                    initContent.style.display = 'block';
                    initCollapseBtn.style.transform = 'rotate(0deg)';
                }
                saveCollapsedState(initPath, initIsCollapsed);
            });
            
            mount.appendChild(header);
            mount.appendChild(initContent);
            renderObject(initContent, json.init, getSchemaForChild({properties:{init:{properties: window.schema?.properties?.init?.properties || window.schemaHintsTree?.init}}}, 'init'), initPath);
        } else {
            const header = document.createElement('div'); 
            header.className='form-section-title'; 
            
            const headerText = document.createElement('span');
            headerText.className = 'title-text';
            headerText.textContent = 'Инициализация (init)';
            header.appendChild(headerText);
            
            const btn = document.createElement('button'); 
            btn.type = 'button';
            btn.className='array-add-btn'; 
            btn.textContent='Добавить init';
            btn.addEventListener('click', ()=>{ 
                json.init = {}; 
                setJsonSafe(json); 
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            });
            header.appendChild(btn); mount.appendChild(header);
        }
        // 4) Блок services с заголовком и кнопкой Добавить сервис
        if (Array.isArray(json.services)) {
            const header = document.createElement('div'); 
            header.className='form-section-title clickable';
            
            // Кнопка сворачивания для services
            const servicesCollapseBtn = document.createElement('span');
            servicesCollapseBtn.className = 'collapse-btn';
            servicesCollapseBtn.textContent = '▼';
            // Стили уже применены через CSS класс collapse-btn
            header.appendChild(servicesCollapseBtn);
            
            const servicesTitleText = document.createElement('span');
            servicesTitleText.className = 'title-text';
            servicesTitleText.textContent = 'Сервисы (service)';
            header.appendChild(servicesTitleText);
            
            const btn = document.createElement('button'); 
            btn.type = 'button';
            btn.className='array-add-btn array-add-btn-right'; 
            btn.textContent='Добавить сервис';
            btn.addEventListener('click', (e)=>{
                e.stopPropagation(); // Предотвращаем сворачивание при клике на кнопку
                if (window.startWizardAddService) window.startWizardAddService(function(services){ 
                    if(!Array.isArray(services)||!services.length) return; 
                    json.services.push(...services); 
                    setJsonSafe(json); 
                    window.renderFormEditor();
                    // Обновляем подсветку ошибок в форме
                    setTimeout(() => {
                        try {
                            if (window.validateJsonInternal) {
                                const result = window.validateJsonInternal(true, true);
                                if (result && result.errors) {
                                    const map = mapErrorsToPaths(result.errors);
                                    applyValidationToForm(map);
                                }
                            }
                        } catch(_) {}
                    }, 100);
                });
            });
            header.appendChild(btn); 
            
            // Контейнер для содержимого services
            const servicesContent = document.createElement('div');
            servicesContent.className = 'form-section-content';
            
            // Обработчик сворачивания для services
            const servicesPath = 'root.services';
            let servicesIsCollapsed = isSectionCollapsed(servicesPath);
            
            // Применяем сохраненное состояние
            if (servicesIsCollapsed) {
                servicesContent.style.display = 'none';
                servicesCollapseBtn.style.transform = 'rotate(-90deg)';
            }
            
            header.addEventListener('click', () => {
                servicesIsCollapsed = !servicesIsCollapsed;
                if (servicesIsCollapsed) {
                    servicesContent.style.display = 'none';
                    servicesCollapseBtn.style.transform = 'rotate(-90deg)';
                } else {
                    servicesContent.style.display = 'block';
                    servicesCollapseBtn.style.transform = 'rotate(0deg)';
                }
                saveCollapsedState(servicesPath, servicesIsCollapsed);
            });
            

            
            mount.appendChild(header);
            mount.appendChild(servicesContent);
            renderArray(servicesContent, json.services, getSchemaForChild({properties:{services:{properties: window.schema?.properties?.services?.items?.properties || window.schemaHintsTree?.services}}}, 'services'), 'root.services');
        } else {
            // Кнопка для добавления services, если отсутствует
            const header = document.createElement('div'); 
            header.className='form-section-title'; 
            
            const headerText = document.createElement('span');
            headerText.className = 'title-text';
            headerText.textContent = 'Сервисы (service)';
            header.appendChild(headerText);
            
            const btn = document.createElement('button'); 
            btn.type = 'button';
            btn.className='array-add-btn'; 
            btn.textContent='Добавить сервис';
            btn.addEventListener('click', ()=>{
                json.services = [];
                setJsonSafe(json); 
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            });
            header.appendChild(btn); mount.appendChild(header);
        }
        // 5) options
        if (Array.isArray(json.options)) {
            const header = document.createElement('div'); 
            header.className='form-section-title clickable';
            
            // Кнопка сворачивания для options
            const optionsCollapseBtn = document.createElement('span');
            optionsCollapseBtn.className = 'collapse-btn';
            optionsCollapseBtn.textContent = '▼';
            // Стили уже применены через CSS класс collapse-btn
            header.appendChild(optionsCollapseBtn);
            
            const optionsTitleText = document.createElement('span');
            optionsTitleText.className = 'title-text';
            optionsTitleText.textContent = 'Опции (options)';
            header.appendChild(optionsTitleText);
            
            const btn = document.createElement('button'); 
            btn.type = 'button';
            btn.className='array-add-btn array-add-btn-right'; 
            btn.textContent='Добавить опцию';
            btn.addEventListener('click', (e)=>{
                e.stopPropagation(); // Предотвращаем сворачивание при клике на кнопку
                if (window.startWizardAddOption) window.startWizardAddOption(function(opt){ 
                    if(!opt) return; 
                    json.options.push(opt); 
                    setJsonSafe(json); 
                    window.renderFormEditor();
                    // Обновляем подсветку ошибок в форме
                    setTimeout(() => {
                        try {
                            if (window.validateJsonInternal) {
                                const result = window.validateJsonInternal(true, true);
                                if (result && result.errors) {
                                    const map = mapErrorsToPaths(result.errors);
                                    applyValidationToForm(map);
                                }
                            }
                        } catch(_) {}
                    }, 100);
                }); 
            });
            header.appendChild(btn); 
            
            // Контейнер для содержимого options
            const optionsContent = document.createElement('div');
            optionsContent.className = 'form-section-content';
            
            // Обработчик сворачивания для options
            const optionsPath = 'root.options';
            let optionsIsCollapsed = isSectionCollapsed(optionsPath);
            
            // Применяем сохраненное состояние
            if (optionsIsCollapsed) {
                optionsContent.style.display = 'none';
                optionsCollapseBtn.style.transform = 'rotate(-90deg)';
            }
            
            header.addEventListener('click', () => {
                optionsIsCollapsed = !optionsIsCollapsed;
                if (optionsIsCollapsed) {
                    optionsContent.style.display = 'none';
                    optionsCollapseBtn.style.transform = 'rotate(-90deg)';
                } else {
                    optionsContent.style.display = 'block';
                    optionsCollapseBtn.style.transform = 'rotate(0deg)';
                }
                saveCollapsedState(optionsPath, optionsIsCollapsed);
            });
            
            mount.appendChild(header);
            mount.appendChild(optionsContent);
            renderArray(optionsContent, json.options, getSchemaForChild({properties:{options:{properties: window.schema?.properties?.options?.items?.properties || window.schemaHintsTree?.options}}}, 'options'), 'root.options');
        } else {
            const header = document.createElement('div'); 
            header.className='form-section-title'; 
            
            const headerText = document.createElement('span');
            headerText.className = 'title-text';
            headerText.textContent = 'Опции (options)';
            header.appendChild(headerText);
            
            const btn = document.createElement('button'); 
            btn.type = 'button';
            btn.className='array-add-btn'; 
            btn.textContent='Добавить опцию';
            btn.addEventListener('click', ()=>{ 
                json.options = []; 
                setJsonSafe(json); 
                window.renderFormEditor();
                // Обновляем подсветку ошибок в форме
                setTimeout(() => {
                    try {
                        if (window.validateJsonInternal) {
                            const result = window.validateJsonInternal(true, true);
                            if (result && result.errors) {
                                const map = mapErrorsToPaths(result.errors);
                                applyValidationToForm(map);
                            }
                        }
                    } catch(_) {}
                }, 100);
            });
            header.appendChild(btn); mount.appendChild(header);
        }

        // Синхронизация ошибок валидации на перерисовке
        try { 
            window.validateJsonInternal(true, true);
            
            // Обновляем подсветку ошибок в форме
            setTimeout(() => {
                try {
                    if (window.validateJsonInternal) {
                        const result = window.validateJsonInternal(true, true);
                        if (result && result.errors) {
                            const map = mapErrorsToPaths(result.errors);
                            applyValidationToForm(map);
                        }
                    }
                } catch(e) {
                    console.error('Ошибка при обновлении валидации при перерисовке:', e);
                }
            }, 100);
        } catch(e) {
            console.error('Ошибка при вызове validateJsonInternal при перерисовке:', e);
        }
    };

    // Функция для показа диалога с подсказками и ошибками
    window.showErrorDialog = function(title, message, isError = false) {
        const dialog = document.getElementById('errorDialog');
        const titleEl = document.getElementById('errorDialogTitle');
        const messageEl = document.getElementById('errorDialogMessage');
        const closeBtn = document.getElementById('errorDialogClose');
        const okBtn = document.getElementById('errorDialogOk');
        
        if (!dialog || !titleEl || !messageEl) return;
        
        // Устанавливаем содержимое
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        // Меняем стиль заголовка в зависимости от типа сообщения
        const headerEl = dialog.querySelector('.error-dialog-header');
        if (headerEl) {
            if (isError) {
                headerEl.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
            } else {
                headerEl.style.background = 'linear-gradient(135deg, #17a2b8 0%, #138496 100%)';
            }
        }
        
        // Показываем диалог
        dialog.classList.add('show');
        
        // Функция закрытия диалога
        const closeDialog = () => {
            dialog.classList.remove('show');
        };
        
        // Обработчики закрытия - добавляем каждый раз заново
        closeBtn.onclick = closeDialog;
        okBtn.onclick = closeDialog;
        
        // Закрытие по клику вне диалога
        dialog.onclick = (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        };
        
        // Закрытие по Escape - добавляем каждый раз заново
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Очистка только escape обработчика при закрытии
        const cleanup = () => {
            document.removeEventListener('keydown', escapeHandler);
            dialog.removeEventListener('transitionend', cleanup);
        };
        
        // Убираем обработчики после анимации закрытия
        dialog.addEventListener('transitionend', cleanup);
    };

    // Отслеживание валидации для подсветки в форме
    document.addEventListener('jsonValidated', function(e){
        const detail = e && e.detail; 
        if (!detail) {
            return;
        }
        
        const map = mapErrorsToPaths(detail.errors||[]);
        applyValidationToForm(map);
    });
    
    // Тестовая функция для проверки валидации
    window.testFormValidation = function() {
        try {
            if (window.validateJsonInternal) {
                const result = window.validateJsonInternal(true, true);
                if (result && result.errors) {
                    const map = mapErrorsToPaths(result.errors);
                    applyValidationToForm(map);
                }
            }
        } catch(e) {
            console.error('Ошибка при тестовой валидации:', e);
        }
    };
})();




