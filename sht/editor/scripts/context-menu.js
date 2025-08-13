// context-menu.js
// Модуль для контекстного меню редактора

// Глобальные переменные
let contextMenu = null;
let isContextMenuVisible = false;
window.__contextMenuInitialized = window.__contextMenuInitialized || false;

// Инициализация контекстного меню
window.initContextMenu = function() {
    if (window.__contextMenuInitialized) return;
    contextMenu = document.getElementById('contextMenu');
    
    if (!contextMenu) {
        console.error('Ошибка контекстного меню: элемент contextMenu не найден');
        return;
    }
    
    // Обработчики событий для контекстного меню
    setupContextMenuEventListeners();
    
    // Обработчики для скрытия меню
    setupContextMenuHideListeners();
    
    // Инициализируем видимость элементов
    updateContextMenuVisibility();

    // Привязываем глобальные горячие клавиши и подписи в меню
    try { bindGlobalShortcuts(); applyShortcutHints(); } catch(e) { console.warn(e); }
    window.__contextMenuInitialized = true;
};

// Настройка обработчиков событий для контекстного меню
function setupContextMenuEventListeners() {
    // Обработчик клика по элементам меню
    contextMenu.addEventListener('click', function(e) {
        const menuItem = e.target.closest('.context-menu-item');
        if (!menuItem) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const action = menuItem.getAttribute('data-action');
        if (action) {
            executeContextMenuAction(action);
        }
        
        hideContextMenu();
    });
    
    // Предотвращение всплытия событий
    contextMenu.addEventListener('mousedown', function(e) {
        e.stopPropagation();
    });
    
    contextMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

// Настройка обработчиков для скрытия контекстного меню
function setupContextMenuHideListeners() {
    // Скрытие по клику вне меню
    document.addEventListener('click', function(e) {
        if (contextMenu && contextMenu.style.display !== 'none' && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    // Скрытие по нажатию Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && contextMenu && contextMenu.style.display !== 'none') {
            hideContextMenu();
        }
    });
}

// Позиционирование контекстного меню
function positionContextMenu(x, y) {
    if (!contextMenu) return;
    
    const menuRect = contextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Корректируем позицию, чтобы меню не выходило за границы экрана
    let adjustedX = x;
    let adjustedY = y;
    
    if (x + menuRect.width > viewportWidth) {
        adjustedX = viewportWidth - menuRect.width - 10;
    }
    
    if (y + menuRect.height > viewportHeight) {
        adjustedY = viewportHeight - menuRect.height - 10;
    }
    
    // Убеждаемся, что меню не выходит за левую и верхнюю границы
    adjustedX = Math.max(10, adjustedX);
    adjustedY = Math.max(10, adjustedY);
    
    contextMenu.style.left = adjustedX + 'px';
    contextMenu.style.top = adjustedY + 'px';
}

// Показать контекстное меню
window.showContextMenu = function(x, y, event) {
    if (!contextMenu || !window.editor) {
        console.error('showContextMenu: contextMenu или editor не найдены');
        return;
    }
    
    // Предотвращаем стандартное контекстное меню браузера
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Показываем меню
    contextMenu.style.display = 'block';
    isContextMenuVisible = true;
    // Синхронизируем флаг с window для внешних модулей
    window.isContextMenuVisible = true;
    
    // Позиционируем меню
    positionContextMenu(x, y);
    
    // Фокус на редактор для корректной работы горячих клавиш
    setTimeout(() => {
        window.editor.focus();
    }, 10);
};

// Скрыть контекстное меню
function hideContextMenu() {
    if (!contextMenu) return;
    
    contextMenu.style.display = 'none';
    isContextMenuVisible = false;
    // Синхронизируем флаг с window для внешних модулей
    window.isContextMenuVisible = false;
}

// Выполнение действий контекстного меню
function executeContextMenuAction(action) {
    if (!window.editor) return;
    
    switch (action) {
        case 'selectAll':
            window.editor.execCommand('selectAll');
            break;
            
        case 'copy':
            try {
                const selectedText = window.editor.getSelection();
                if (selectedText) {
                    // Копируем выделенный текст
                    navigator.clipboard.writeText(selectedText);
                    window.showToast('Скопировано', 'success');
                } else {
                    // Копируем весь текст
                    navigator.clipboard.writeText(window.editor.getValue());
                    window.showToast('Весь текст скопирован', 'success');
                }
            } catch (e) {
                console.error('Ошибка копирования:', e);
                window.showToast('Ошибка копирования', 'error');
            }
            break;
            
        case 'paste':
            try {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        window.editor.replaceSelection(text);
                        window.showToast('Вставлено', 'success');
                    }
                }).catch(e => {
                    console.error('Ошибка вставки:', e);
                    window.showToast('Ошибка вставки', 'error');
                });
            } catch (e) {
                console.error('Ошибка вставки:', e);
                window.showToast('Ошибка вставки', 'error');
            }
            break;
            
        case 'undo':
            window.editor.undo();
            break;
            
        case 'redo':
            window.editor.redo();
            break;
            
        case 'find':
            window.editor.execCommand('find');
            break;
            
        case 'replace':
            window.editor.execCommand('replace');
            break;
            
        case 'addService':
            if (typeof window.startWizardAddService === 'function') {
                window.startWizardAddService(function(services){
                    if (!Array.isArray(services) || services.length===0) return;
                    try {
                        const json = JSON.parse(window.editor.getValue()||'{}');
                        if (!Array.isArray(json.services)) json.services = [];
                        json.services.push(...services);
                        window.editor.setValue(JSON.stringify(json, null, 2));
                        window.editor.refresh();
                        window.showToast('Сервис добавлен через мастер', 'success');
                    } catch(e) { window.showToast('Ошибка добавления сервиса: '+e.message, 'error'); }
                });
            } else if (typeof addService === 'function') { addService(); }
            break;
            
        case 'addCharacteristic':
            (function(){
                try {
                    const path = window.currentJsonCursorPath || [];
                    if (path.length >= 2 && path[0].key === 'services' && typeof path[1].key === 'number') {
                        const json = JSON.parse(window.editor.getValue());
                        const svc = json.services[path[1].key];
                        if (svc && typeof window.startWizardAddCharacteristics === 'function') {
                            window.startWizardAddCharacteristics(svc.type, function(chars){
                                if (!Array.isArray(chars) || chars.length===0) return;
                                if (!Array.isArray(svc.characteristics)) svc.characteristics = [];
                                svc.characteristics.push(...chars.map(c=>({ type: c.type || '', link: [{}] })));
                                window.editor.setValue(JSON.stringify(json, null, 2));
                                window.editor.refresh();
                                window.showToast('Характеристики добавлены через мастер', 'success');
                            });
                            return;
                        }
                    }
                } catch(e) {}
                if (typeof addCharacteristic === 'function') addCharacteristic();
            })();
            break;
            
        case 'addOption':
            if (typeof window.startWizardAddOption === 'function') {
                window.startWizardAddOption(function(opt){
                    if (!opt) return;
                    try {
                        const json = JSON.parse(window.editor.getValue()||'{}');
                        if (!Array.isArray(json.options)) json.options = [];
                        json.options.push(opt);
                        window.editor.setValue(JSON.stringify(json, null, 2));
                        window.editor.refresh();
                        window.showToast('Опция добавлена через мастер', 'success');
                    } catch(e) { window.showToast('Ошибка добавления опции: '+e.message, 'error'); }
                });
            } else if (typeof addOption === 'function') { addOption(); }
            break;
            
        case 'addLink':
            (function(){
                try {
                    const path = window.currentJsonCursorPath || [];
                    if (path.length >= 4 && path[0].key === 'services' && typeof path[1].key === 'number' && path[2].key === 'characteristics' && typeof path[3].key === 'number') {
                        const json = JSON.parse(window.editor.getValue());
                        const svc = json.services[path[1].key];
                        const char = svc.characteristics[path[3].key];
                        if (svc && char && typeof window.startWizardAddLink === 'function') {
                            window.startWizardAddLink(svc.type, char.type, function(links){
                                if (!Array.isArray(links) || links.length===0) return;
                                if (!Array.isArray(char.link)) char.link = [];
                                char.link.push(...links);
                                window.editor.setValue(JSON.stringify(json, null, 2));
                                window.editor.refresh();
                                window.showToast('Линки добавлены через мастер', 'success');
                            });
                            return;
                        }
                    }
                } catch(e) {}
                if (typeof addLink === 'function') addLink();
            })();
            break;
            
        case 'fixRequirements':
            if (typeof correctJson === 'function') {
                correctJson();
            }
            break;
            
        case 'validate':
            if (typeof validateJson === 'function') {
                validateJson();
            }
            break;
            
        case 'format':
            if (typeof formatJson === 'function') {
                formatJson();
            }
            break;
    }
}

// Настройка контекстного меню для редактора
window.setupEditorContextMenu = function() {
    if (!window.editor) {
        console.error('setupEditorContextMenu: editor не найден');
        return;
    }
    
    // Обработчик правого клика на редакторе
    window.editor.getWrapperElement().addEventListener('contextmenu', function(e) {
        
        // Получаем координаты клика
        const x = e.clientX;
        const y = e.clientY;
        
        // Обновляем видимость элементов меню в зависимости от позиции курсора
        updateContextMenuVisibility();
        
        // Показываем контекстное меню
        window.showContextMenu(x, y, e);
    });

    // Также инициируем меню один раз, чтобы корректно работали глобальные слушатели
    if (typeof window.initContextMenu === 'function') {
        window.initContextMenu();
    }
};

// Обновление видимости элементов контекстного меню
function updateContextMenuVisibility() {
    if (!contextMenu) return;
    
    const path = window.currentJsonCursorPath || [];
    
    // Кнопка "Добавить характеристику" только если курсор внутри services/N
    let inService = false;
    if (path && path.length >= 2 && path[0].key === 'services' && typeof path[1].key === 'number') {
        inService = true;
    }
    
    const addCharItem = contextMenu.querySelector('[data-action="addCharacteristic"]');
    if (addCharItem) {
        addCharItem.style.display = inService ? '' : 'none';
    }
    
    // Кнопка "Добавить линк" только если курсор внутри services/N/characteristics/M или options/N
    let inCharacteristic = false, inOption = false;
    if (path && path.length >= 4 && path[0].key === 'services' && typeof path[1].key === 'number' && path[2].key === 'characteristics' && typeof path[3].key === 'number') {
        inCharacteristic = true;
    }
    if (path && path.length >= 2 && path[0].key === 'options' && typeof path[1].key === 'number') {
        inOption = true;
    }
    
    const addLinkItem = contextMenu.querySelector('[data-action="addLink"]');
    if (addLinkItem) {
        addLinkItem.style.display = (inCharacteristic || inOption) ? '' : 'none';
    }
}

// Унифицированный helper для обновления видимости команд (тулбар/контекстное меню)
window.updateCommandVisibility = function() {
    const path = window.currentJsonCursorPath || [];
    const inService = path && path.length >= 2 && path[0].key === 'services' && typeof path[1].key === 'number';
    const inCharacteristic = path && path.length >= 4 && path[0].key === 'services' && typeof path[1].key === 'number' && path[2].key === 'characteristics' && typeof path[3].key === 'number';
    const inOption = path && path.length >= 2 && path[0].key === 'options' && typeof path[1].key === 'number';

    // Тулбар
    const addCharBtn = document.getElementById('addCharacteristicBtn');
    const addLinkBtn = document.getElementById('addLinkBtn');
    if (addCharBtn) addCharBtn.style.display = inService ? '' : 'none';
    if (addLinkBtn) addLinkBtn.style.display = (inCharacteristic || inOption) ? '' : 'none';

    // Контекстное меню
    if (contextMenu) {
        const addCharItem = contextMenu.querySelector('[data-action="addCharacteristic"]');
        if (addCharItem) addCharItem.style.display = inService ? '' : 'none';
        const addLinkItem = contextMenu.querySelector('[data-action="addLink"]');
        if (addLinkItem) addLinkItem.style.display = (inCharacteristic || inOption) ? '' : 'none';
    }
};

// --- Горячие клавиши и подписи ---
function getShortcutMap() {
    // Alt/Option-комбинации, чтобы не конфликтовать с браузером
    return {
        addService: { combo: 'Alt+S', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='s') },
        addCharacteristic: { combo: 'Alt+C', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='c') },
        addOption: { combo: 'Alt+O', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='o') },
        addLink: { combo: 'Alt+L', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='l') },
        fixRequirements: { combo: 'Alt+R', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='r') },
        validate: { combo: 'Alt+V', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='v') },
        format: { combo: 'Alt+F', test: (e)=> e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key.toLowerCase()==='f') },
    };
}

function applyShortcutHints() {
    if (!contextMenu) return;
    const map = getShortcutMap();
    Object.keys(map).forEach(action => {
        const item = contextMenu.querySelector(`[data-action="${action}"]`);
        if (!item) return;
        let hint = item.querySelector('.context-menu-shortcut');
        if (!hint) {
            hint = document.createElement('span');
            hint.className = 'context-menu-shortcut';
            item.appendChild(hint);
        }
        hint.textContent = map[action].combo;
    });
}

function bindGlobalShortcuts() {
    const map = getShortcutMap();
    document.addEventListener('keydown', function(e){
        // Не мешаем, если открыт ввод текста в обычных инпутах вне CodeMirror
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const isEditor = !!(e.target && e.target.closest && (e.target.closest('.CodeMirror') || e.target.closest('.cm-editor')));
        if (!isEditor && (tag === 'input' || tag === 'select' || tag === 'textarea')) return;

        const fire = (action)=>{
            const fnByAction = {
                addService: ()=> typeof addService === 'function' ? addService() : (window.startWizardAddService && window.startWizardAddService(function(){}) ),
                addCharacteristic: ()=> typeof addCharacteristic === 'function' && addCharacteristic(),
                addOption: ()=> typeof addOption === 'function' && addOption(),
                addLink: ()=> typeof addLink === 'function' && addLink(),
                fixRequirements: ()=> typeof correctJson === 'function' && correctJson(),
                validate: ()=> typeof validateJson === 'function' && validateJson(),
                format: ()=> typeof formatJson === 'function' && formatJson(),
            };
            const fn = fnByAction[action];
            if (typeof fn === 'function') {
                e.preventDefault();
                e.stopPropagation();
                try { fn(); } catch(err) { console.warn(err); }
            }
        };

        for (const [action, def] of Object.entries(map)) {
            try {
                if (def.test(e)) { fire(action); return; }
            } catch(_){/*noop*/}
        }
    }, true);
}

// Экспорт функций для глобального использования
window.hideContextMenu = hideContextMenu;
window.updateContextMenuVisibility = updateContextMenuVisibility; 