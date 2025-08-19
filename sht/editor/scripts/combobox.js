// combobox.js
// Переиспользуемый компонент combobox для форм

(function() {
    // Функция для создания переиспользуемого combobox
    function createCombobox(options, placeholder, onSelect, onInput, autoOpen = false) {
        const container = document.createElement('div');
        container.className = 'combobox-container';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder || 'Введите значение...';
        input.className = 'add-field-key-input';
        
        const dropdownButton = document.createElement('button');
        dropdownButton.type = 'button';
        dropdownButton.className = 'dropdown-button';
        dropdownButton.innerHTML = '▼';
        
        const dropdownList = document.createElement('div');
        dropdownList.className = 'dropdown-list';
        dropdownList.style.display = 'none';
        
        // Добавляем все доступные опции в выпадающий список
        if (options && options.length > 0) {
            options.forEach(option => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                item.textContent = option;
                item.addEventListener('click', () => {
                    input.value = option;
                    dropdownList.style.display = 'none';
                    if (onSelect) {
                        onSelect(option);
                    }
                });
                dropdownList.appendChild(item);
            });
        }
        
        // Обработчик клика по кнопке выпадающего списка
        dropdownButton.addEventListener('click', () => {
            if (dropdownList.style.display === 'none') {
                dropdownList.style.display = 'block';
            } else {
                dropdownList.style.display = 'none';
            }
        });
        
        // Обработчик клика вне выпадающего списка для его закрытия
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdownList.style.display = 'none';
            }
        });
        
        // Обработчики для текстового поля
        input.addEventListener('input', (e) => {
            const value = e.target.value.toLowerCase();
            
            // Показываем выпадающий список при вводе текста
            if (value.length > 0) {
                dropdownList.style.display = 'block';
            }
            
            // Фильтруем выпадающий список по введенному тексту
            Array.from(dropdownList.children).forEach(item => {
                if (item.textContent.toLowerCase().includes(value)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
            
            if (onInput) {
                onInput(e.target.value);
            }
        });
        
        // Обработчик фокуса - показываем список при фокусе
        input.addEventListener('focus', () => {
            if (options && options.length > 0) {
                dropdownList.style.display = 'block';
            }
        });
        
        // Собираем combobox
        container.appendChild(input);
        container.appendChild(dropdownButton);
        container.appendChild(dropdownList);
        
        // Автоматически раскрываем список если указан флаг
        if (autoOpen && options && options.length > 0) {
            // Небольшая задержка для корректного отображения
            setTimeout(() => {
                dropdownList.style.display = 'block';
            }, 10);
        }
        
        // Возвращаем объект с методами для управления
        return {
            container: container,
            input: input,
            getValue: () => input.value,
            setValue: (value) => { input.value = value; },
            focus: () => input.focus(),
            clear: () => { input.value = ''; }
        };
    }
    
    // Делаем функцию доступной глобально
    window.createCombobox = createCombobox;
})();
