// error-handler.js
// Централизованная обработка ошибок
// Принцип: Single Responsibility - одна система для всех ошибок

import { ERROR_MESSAGES, MESSAGE_TYPES } from '../constants.js';

/**
 * Класс для централизованной обработки ошибок
 */
class ErrorHandler {
    /**
     * Обрабатывает ошибку
     * @param {Error} error - Объект ошибки
     * @param {string} context - Контекст возникновения ошибки
     * @param {Object} options - Опции обработки
     * @param {boolean} options.showToUser - Показывать ли ошибку пользователю
     * @param {boolean} options.logToConsole - Логировать ли в консоль
     * @param {string} options.customMessage - Пользовательское сообщение
     */
    static handle(error, context, options = {}) {
        const {
            showToUser = true,
            logToConsole = true,
            customMessage = null
        } = options;
        
        // Логирование в консоль
        if (logToConsole) {
            this.logError(error, context);
        }
        
        // Показ пользователю
        if (showToUser) {
            const message = customMessage || this.getUserFriendlyMessage(error);
            this.showUserError(message, context);
        }
        
        // Можно добавить отправку в систему мониторинга
        // this.sendToMonitoring(error, context);
    }
    
    /**
     * Логирует ошибку в консоль
     * @param {Error} error - Объект ошибки
     * @param {string} context - Контекст
     */
    static logError(error, context) {
        console.error(`[${context}]`, error);
        
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
    
    /**
     * Показывает ошибку пользователю
     * @param {string} message - Сообщение об ошибке
     * @param {string} context - Контекст
     */
    static showUserError(message, context) {
        // Используем существующий showToast если доступен
        if (typeof window.showToast === 'function') {
            window.showToast(message, MESSAGE_TYPES.ERROR);
        }
        
        // Дублируем в errorOutput для критичных ошибок
        this.updateErrorOutput(message);
    }
    
    /**
     * Обновляет элемент errorOutput
     * @param {string} message - Сообщение
     */
    static updateErrorOutput(message) {
        const errorOutput = document.getElementById('errorOutput');
        if (errorOutput) {
            errorOutput.innerHTML = `<ul><li>${message}</li></ul>`;
        }
    }
    
    /**
     * Очищает вывод ошибок
     */
    static clearErrorOutput() {
        const errorOutput = document.getElementById('errorOutput');
        if (errorOutput) {
            errorOutput.textContent = '';
        }
    }
    
    /**
     * Преобразует техническую ошибку в понятное сообщение
     * @param {Error} error - Объект ошибки
     * @returns {string} Понятное сообщение
     */
    static getUserFriendlyMessage(error) {
        // Сопоставление типов ошибок с сообщениями
        const errorTypeMessages = {
            'SyntaxError': ERROR_MESSAGES.PARSE_ERROR,
            'TypeError': 'Неверный тип данных',
            'ReferenceError': 'Обращение к несуществующей переменной',
            'RangeError': 'Значение вне допустимого диапазона',
            'URIError': 'Ошибка в URI'
        };
        
        const errorType = error?.constructor?.name;
        const baseMessage = errorTypeMessages[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR;
        
        // Добавляем детали если есть
        if (error?.message) {
            return `${baseMessage}: ${error.message}`;
        }
        
        return baseMessage;
    }
    
    /**
     * Проверяет, является ли ошибка критичной
     * @param {Error} error - Объект ошибки
     * @returns {boolean} true если критичная
     */
    static isCriticalError(error) {
        const criticalTypes = [
            'TypeError',
            'ReferenceError',
            'RangeError'
        ];
        
        return criticalTypes.includes(error?.constructor?.name);
    }
    
    /**
     * Обрабатывает ошибку парсинга JSON
     * @param {Error} error - Ошибка парсинга
     * @param {string} jsonString - JSON строка
     */
    static handleJSONParseError(error, jsonString) {
        let message = ERROR_MESSAGES.PARSE_ERROR;
        
        // Пытаемся определить место ошибки
        if (error.message) {
            const positionMatch = error.message.match(/position\s+(\d+)/i);
            if (positionMatch) {
                const position = parseInt(positionMatch[1], 10);
                const lineNumber = this.getLineNumber(jsonString, position);
                message += ` на строке ${lineNumber}`;
            }
        }
        
        this.handle(error, 'JSON Parse', {
            customMessage: message,
            showToUser: true,
            logToConsole: true
        });
    }
    
    /**
     * Определяет номер строки по позиции в тексте
     * @param {string} text - Текст
     * @param {number} position - Позиция символа
     * @returns {number} Номер строки
     */
    static getLineNumber(text, position) {
        const beforeError = text.substring(0, position);
        return beforeError.split('\n').length;
    }
    
    /**
     * Безопасное выполнение функции с обработкой ошибок
     * @param {Function} fn - Функция для выполнения
     * @param {string} context - Контекст выполнения
     * @param {*} defaultValue - Значение по умолчанию при ошибке
     * @returns {*} Результат функции или defaultValue
     */
    static safeTry(fn, context, defaultValue = null) {
        try {
            return fn();
        } catch (error) {
            this.handle(error, context);
            return defaultValue;
        }
    }
    
    /**
     * Безопасное выполнение async функции
     * @param {Function} fn - Async функция
     * @param {string} context - Контекст
     * @param {*} defaultValue - Значение по умолчанию
     * @returns {Promise<*>} Результат или defaultValue
     */
    static async safeTryAsync(fn, context, defaultValue = null) {
        try {
            return await fn();
        } catch (error) {
            this.handle(error, context);
            return defaultValue;
        }
    }
}

/**
 * Декоратор для автоматической обработки ошибок в функциях
 * @param {string} context - Контекст функции
 * @returns {Function} Декоратор
 */
export function withErrorHandling(context) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = function(...args) {
            try {
                const result = originalMethod.apply(this, args);
                
                // Обработка промисов
                if (result && typeof result.then === 'function') {
                    return result.catch(error => {
                        ErrorHandler.handle(error, context);
                        throw error;
                    });
                }
                
                return result;
            } catch (error) {
                ErrorHandler.handle(error, context);
                throw error;
            }
        };
        
        return descriptor;
    };
}

// Экспорт для не-ES6 модулей
if (typeof window !== 'undefined') {
    window.ErrorHandler = ErrorHandler;
}

export default ErrorHandler;

