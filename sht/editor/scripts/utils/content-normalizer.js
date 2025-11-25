// content-normalizer.js
// Утилиты для нормализации контента (удаление BOM, обработка кодировок)
// Принцип: DRY - единая реализация логики нормализации

/**
 * Нормализует контент файла - удаляет BOM, преобразует в строку
 * @param {string|Uint8Array} content - Содержимое файла
 * @returns {string} Нормализованная строка
 */
function normalizeContent(content) {
    if (!content) return '';
    
    let text = content;
    
    // Преобразуем Uint8Array в строку если нужно
    if (content instanceof Uint8Array) {
        text = decodeUint8Array(content);
    }
    
    // Если не строка, возвращаем как есть
    if (typeof text !== 'string') {
        return String(content);
    }
    
    // Удаляем все варианты BOM
    return removeBOM(text);
}

/**
 * Декодирует Uint8Array в строку UTF-8
 * @param {Uint8Array} uint8Array - Массив байтов
 * @returns {string} Декодированная строка
 */
function decodeUint8Array(uint8Array) {
    try {
        return new TextDecoder('utf-8').decode(uint8Array);
    } catch (error) {
        console.error('Ошибка декодирования:', error);
        // Fallback: преобразуем через String.fromCharCode
        return String.fromCharCode.apply(null, uint8Array);
    }
}

/**
 * Удаляет все варианты BOM (Byte Order Mark) из строки
 * @param {string} text - Исходная строка
 * @returns {string} Строка без BOM
 */
function removeBOM(text) {
    if (!text) return text;
    
    let result = text;
    // Получаем паттерны из window.CONSTANTS или используем fallback
    const patterns = window.CONSTANTS?.BOM_PATTERNS || {
        UTF8: /^\uFEFF/,
        HEX_FF: /^\uffff/,
        HEX_FEFF: /^\ufeff/
    };
    
    // Применяем все паттерны BOM
    for (const pattern of Object.values(patterns)) {
        result = result.replace(pattern, '');
    }
    
    return result;
}

/**
 * Проверяет, является ли контент JSON
 * @param {string} content - Содержимое для проверки
 * @returns {boolean} true если JSON
 */
function isJSONContent(content) {
    if (typeof content !== 'string') return false;
    
    const trimmed = content.trim();
    return (trimmed.startsWith('{') || trimmed.startsWith('[')) && 
           (trimmed.endsWith('}') || trimmed.endsWith(']'));
}

/**
 * Безопасный парсинг JSON с нормализацией
 * @param {string} content - JSON строка
 * @returns {{success: boolean, data?: any, error?: Error}}
 */
function safeJSONParse(content) {
    try {
        const normalized = normalizeContent(content);
        const data = JSON.parse(normalized);
        return { success: true, data };
    } catch (error) {
        return { success: false, error };
    }
}

/**
 * Определяет кодировку файла по BOM
 * @param {Uint8Array} bytes - Первые байты файла
 * @returns {string} Название кодировки
 */
function detectEncoding(bytes) {
    if (!bytes || bytes.length < 3) return 'utf-8';
    
    // UTF-8 BOM: EF BB BF
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return 'utf-8';
    }
    
    // UTF-16 BE BOM: FE FF
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
        return 'utf-16be';
    }
    
    // UTF-16 LE BOM: FF FE
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
        return 'utf-16le';
    }
    
    return 'utf-8'; // По умолчанию
}

// Экспорт для не-ES6 модулей
if (typeof window !== 'undefined') {
    window.ContentNormalizer = {
        normalizeContent,
        isJSONContent,
        safeJSONParse,
        detectEncoding
    };
}

