// constants.js
// Централизованное хранилище констант проекта
// Принцип: Constants over Magic Numbers

// ============================================
// ТАЙМАУТЫ И ЗАДЕРЖКИ (в миллисекундах)
// ============================================

const TIMING = {
    // Toast уведомления
    TOAST_SHOW_DELAY: 10,          // Задержка перед показом toast
    TOAST_HIDE_ANIMATION: 300,     // Длительность анимации скрытия
    TOAST_DEFAULT_DURATION: 3000,  // Длительность показа по умолчанию
    
    // Валидация
    VALIDATION_DELAY: 100,          // Задержка перед валидацией
    VALIDATION_AFTER_FIX: 200,      // Задержка валидации после автофикса
    
    // Автодополнение
    AUTOCOMPLETE_SHORT_DELAY: 50,   // Короткая задержка для автодополнения
    AUTOCOMPLETE_LONG_DELAY: 100,   // Длинная задержка для автодополнения
    
    // Рендеринг
    RENDER_DELAY: 0,                // Задержка для рендеринга (nextTick)
    RENDER_AFTER_UPDATE: 50,        // Задержка рендеринга после обновления
    
    // Прочее
    CURSOR_UPDATE_DELAY: 0,         // Обновление позиции курсора
    DEBOUNCE_DEFAULT: 300,          // Стандартная задержка для debounce
    LONG_PRESS_DELAY: 550,          // Длительность удержания для long press
    MOVE_TOLERANCE: 10,             // Допустимое смещение пальца (px)
};

// ============================================
// СИМВОЛЫ И ПАТТЕРНЫ
// ============================================

const SPECIAL_CHARS = {
    QUOTE: '"',
    ESCAPE: '\\',
    BRACE_OPEN: '{',
    BRACE_CLOSE: '}',
    BRACKET_OPEN: '[',
    BRACKET_CLOSE: ']',
    COMMA: ',',
    COLON: ':',
    SEMICOLON: ';',
    PIPE: '|',
};

const BOM_PATTERNS = {
    UTF8: /^\uFEFF/,
    HEX_FF: /^\uffff/,
    HEX_FEFF: /^\ufeff/,
};

const JSON_PATTERNS = {
    ARRAY_INDEX: /^\d+$/,
    PATH_SEPARATOR: /\.|\[(\d+)\]/,
    KEY_REGEX: (key) => new RegExp(`"${key}"\\s*:`),
};

// ============================================
// КОНТРОЛЛЕРЫ
// ============================================

const CONTROLLERS = [
    { name: 'MQTT', value: 'MQTT' },
    { name: 'ZigBee', value: 'ZigBee' },
    { name: 'ModBus', value: 'ModBus' },
    { name: 'Xiaomi', value: 'Xiaomi' },
    { name: 'ZWave', value: 'ZWave' }
];

// ============================================
// ТИПЫ СООБЩЕНИЙ
// ============================================

const MESSAGE_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning'
};

// ============================================
// ТЕМЫ ОФОРМЛЕНИЯ
// ============================================

const THEMES = {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system'
};

// ============================================
// ИМЕНА ПОЛЕЙ ДЛЯ ПЕРЕИМЕНОВАНИЯ
// ============================================

const FIELD_RENAME_MAP = {
    mapOut: 'outMap',
    mapIn: 'map',
    inMap: 'map',
    funcOut: 'outFunc',
    func: 'inFunc',
    funcIn: 'inFunc'
};

// ============================================
// ПОЛЯ ДЛЯ УДАЛЕНИЯ (устаревшие)
// ============================================

const DEPRECATED_FIELDS = [
    'status',
    'date',
    'overview',
    'url',
    'ali',
    'ali2',
    'topicSearch' // Удаляется после переноса в modelIds
];

// ============================================
// РАЗДЕЛИТЕЛИ
// ============================================

const SEPARATORS = {
    VALID_VALUES: ',',  // Разделитель для validValues
    MAP_VALUES: ';',    // Разделитель для map/outMap
    ID_VALUES: '|'      // Разделитель для старых manufacturerId/modelId
};

// ============================================
// СООБЩЕНИЯ ОБ ОШИБКАХ
// ============================================

const ERROR_MESSAGES = {
    PARSE_ERROR: 'Ошибка парсинга JSON',
    ARRAY_TEMPLATE: 'Ошибка: Введите один шаблон (объект JSON), а не массив',
    EMPTY_CONTENT: 'Необходимо сперва открыть файл шаблона',
    VALIDATION_ERROR: 'Ошибка валидации',
    AUTO_FIX_ERROR: 'Ошибка автоматического исправления',
    FILE_READ_ERROR: 'Ошибка чтения файла',
    UNKNOWN_ERROR: 'Произошла неизвестная ошибка'
};

// ============================================
// КЛЮЧИ ЛОКАЛЬНОГО ХРАНИЛИЩА
// ============================================

const STORAGE_KEYS = {
    THEME: 'theme',
    LAST_CONTROLLER: 'lastController',
    FORM_COLLAPSED_STATE: 'formCollapsedState'
};

// ============================================
// ЛИМИТЫ И ОГРАНИЧЕНИЯ
// ============================================

const LIMITS = {
    MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10 MB
    MAX_NESTING_LEVEL: 5,              // Максимальная вложенность в коде
    MAX_FUNCTION_LENGTH: 50,           // Максимальная длина функции (строк)
    MAX_LINE_LENGTH: 120               // Максимальная длина строки
};

// ============================================
// MIME ТИПЫ
// ============================================

const MIME_TYPES = {
    JSON: 'application/json',
    ZIP: 'application/zip',
    TAR_GZ: 'application/gzip'
};

// ============================================
// РАСШИРЕНИЯ ФАЙЛОВ
// ============================================

const FILE_EXTENSIONS = {
    JSON: '.json',
    ZIP: '.zip',
    TAR_GZ: '.tar.gz',
    TGZ: '.tgz'
};

// ============================================
// ИКОНКИ FONT AWESOME
// ============================================

const ICONS = {
    WIZARD: 'fa-solid fa-wand-magic-sparkles',
    CLIPBOARD: 'fas fa-clipboard',
    COPY: 'fas fa-copy',
    PASTE: 'fas fa-paste',
    UNDO: 'fas fa-undo',
    REDO: 'fas fa-redo',
    SEARCH: 'fas fa-search',
    DOWNLOAD: 'fas fa-download',
    UPLOAD: 'fas fa-upload',
    FOLDER_OPEN: 'fas fa-folder-open',
    PLUS: 'fas fa-plus',
    CODE: 'fas fa-code',
    FORM: 'fas fa-list-alt'
};

// ============================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ (для не-ES6 модулей)
// ============================================

if (typeof window !== 'undefined') {
    window.CONSTANTS = {
        TIMING,
        SPECIAL_CHARS,
        BOM_PATTERNS,
        JSON_PATTERNS,
        CONTROLLERS,
        MESSAGE_TYPES,
        THEMES,
        FIELD_RENAME_MAP,
        DEPRECATED_FIELDS,
        SEPARATORS,
        ERROR_MESSAGES,
        STORAGE_KEYS,
        LIMITS,
        MIME_TYPES,
        FILE_EXTENSIONS,
        ICONS
    };
}

