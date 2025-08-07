// Service Types Modal functionality
let serviceTypesData = null;
let filteredServices = [];

// Load service types data
async function loadServiceTypes() {
    try {
        const response = await fetch('sh_types.json');
        const data = await response.json();
        serviceTypesData = data.result.service.types.types;
        return serviceTypesData;
    } catch (error) {
        console.error('Error loading service types:', error);
        showToast('Ошибка загрузки типов сервисов', 'error');
        return [];
    }
}

// Show service types modal
async function showServiceTypes() {
    const modal = document.getElementById('serviceTypesModal');
    const searchInput = document.getElementById('serviceTypesSearch');
    const listContainer = document.getElementById('serviceTypesList');
    
    // Show modal
    modal.style.display = 'flex';
    
    // Load data if not loaded yet
    if (!serviceTypesData) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-color);">Загрузка...</div>';
        const data = await loadServiceTypes();
        if (!data || data.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-color);">Ошибка загрузки данных</div>';
            return;
        }
    }
    
    // Render services
    renderServiceTypes(serviceTypesData || []);
    
    // Focus search input
    setTimeout(() => {
        searchInput.focus();
    }, 100);
    
    // Add search event listener
    searchInput.addEventListener('input', handleServiceSearch);
}

// Close service types modal
function closeServiceTypesModal() {
    const modal = document.getElementById('serviceTypesModal');
    const searchInput = document.getElementById('serviceTypesSearch');
    
    modal.style.display = 'none';
    searchInput.value = '';
    searchInput.removeEventListener('input', handleServiceSearch);
}

// Handle service search
function handleServiceSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    const services = serviceTypesData || [];
    
    if (searchTerm === '') {
        filteredServices = services;
    } else {
        filteredServices = services.filter(service => 
            service.name.toLowerCase().includes(searchTerm) ||
            service.type.toLowerCase().includes(searchTerm)
        );
    }
    
    renderServiceTypes(filteredServices);
}

// Render service types
function renderServiceTypes(services) {
    const listContainer = document.getElementById('serviceTypesList');
    
    if (!services || services.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-color);">Сервисы не найдены</div>';
        return;
    }
    
    // Sort services by name alphabetically
    const sortedServices = services.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    
    const servicesHtml = sortedServices.map(service => createServiceItem(service)).join('');
    listContainer.innerHTML = servicesHtml;
    
    // Add event listeners
    addServiceEventListeners();
}

// Create service item HTML
function createServiceItem(service) {
    const hasRequired = service.required && service.required.length > 0;
    const hasOptional = service.optional && service.optional.length > 0;
    const hasCharacteristics = hasRequired || hasOptional;
    
    return `
        <div class="service-item" data-service-id="${service.type}">
            <div class="service-header" onclick="toggleService('${service.type}')">
                <div class="service-info">
                    <div class="service-name">${service.name}</div>
                    <div class="service-type">${service.type}</div>
                </div>
                ${hasCharacteristics ? '<div class="service-expand"><i class="fas fa-chevron-right"></i></div>' : ''}
            </div>
            ${hasCharacteristics ? `
                <div class="service-characteristics" id="service-${service.type}">
                    ${hasRequired ? `
                        <div class="characteristics-section">
                            <div class="characteristics-title">Обязательные характеристики</div>
                            ${service.required.map(char => createCharacteristicItem(char, 'required')).join('')}
                        </div>
                    ` : ''}
                    ${hasOptional ? `
                        <div class="characteristics-section">
                            <div class="characteristics-title">Опциональные характеристики</div>
                            ${service.optional.map(char => createCharacteristicItem(char, 'optional')).join('')}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

// Create characteristic item HTML
function createCharacteristicItem(characteristic, type) {
    // Check if characteristic has any properties that should be displayed
    const hasProperties = characteristic.read !== undefined || characteristic.write !== undefined || 
                         characteristic.events !== undefined || characteristic.format !== undefined ||
                         characteristic.maxLen !== undefined || characteristic.hidden !== undefined ||
                         characteristic.enum !== undefined || characteristic.validValues !== undefined ||
                         characteristic.minValue !== undefined || characteristic.maxValue !== undefined ||
                         characteristic.minStep !== undefined || characteristic.unit !== undefined;
    
    const uniqueId = `${characteristic.type}-${characteristic.id || Math.random()}-${Date.now()}-${Math.random()}`;
    
    const html = `
        <div class="characteristic-item" data-char-id="${uniqueId}">
            <div class="characteristic-header" onclick="toggleCharacteristic('${uniqueId}')">
                <div class="characteristic-info">
                    <div class="characteristic-name">${characteristic.name}</div>
                    <div class="characteristic-type">${characteristic.type}</div>
                </div>
                <div class="characteristic-expand"><i class="fas fa-chevron-right"></i></div>
            </div>
            <div class="characteristic-properties" id="char-${uniqueId}">
                ${createCharacteristicProperties(characteristic)}
            </div>
        </div>
    `;
    
    return html;
}

// Create characteristic properties HTML
function createCharacteristicProperties(characteristic) {
    const properties = [];
    
    // Basic properties
    if (characteristic.read !== undefined) {
        properties.push(createPropertyItem('Чтение', characteristic.read, 'boolean'));
    }
    if (characteristic.write !== undefined) {
        properties.push(createPropertyItem('Запись', characteristic.write, 'boolean'));
    }
    if (characteristic.events !== undefined) {
        properties.push(createPropertyItem('События', characteristic.events, 'boolean'));
    }
    if (characteristic.hidden !== undefined) {
        properties.push(createPropertyItem('Скрытый', characteristic.hidden, 'boolean'));
    }
    if (characteristic.format !== undefined) {
        properties.push(createPropertyItem('Формат', characteristic.format, 'string'));
    }
    if (characteristic.maxLen !== undefined) {
        properties.push(createPropertyItem('Макс. длина', characteristic.maxLen, 'integer'));
    }
    if (characteristic.minValue !== undefined) {
        properties.push(createPropertyItem('Мин. значение', characteristic.minValue, 'number'));
    }
    if (characteristic.maxValue !== undefined) {
        properties.push(createPropertyItem('Макс. значение', characteristic.maxValue, 'number'));
    }
    if (characteristic.minStep !== undefined) {
        properties.push(createPropertyItem('Мин. шаг', characteristic.minStep, 'number'));
    }
    if (characteristic.unit !== undefined) {
        properties.push(createPropertyItem('Единица', characteristic.unit, 'string'));
    }
    

    
    // Enum values if present
    if (characteristic.enum) {
        properties.push(createEnumOptions(characteristic.enum));
    }
    
    // Valid values if present
    if (characteristic.validValues && Array.isArray(characteristic.validValues) && characteristic.validValues.length > 0) {
        properties.push(createValidValuesOptions(characteristic.validValues));
    }
    
    const result = properties.join('');
    
    // If no properties, show a message
    if (result === '') {
        return '<div class="property-item"><span class="property-name">Нет дополнительных свойств</span></div>';
    }
    
    return result;
}

// Create property item HTML
function createPropertyItem(name, value, type) {
    let valueClass = '';
    let displayValue = value;
    
    if (type === 'boolean') {
        valueClass = value ? 'boolean-true' : 'boolean-false';
        displayValue = value ? 'Да' : 'Нет';
    } else if (type === 'string') {
        valueClass = 'string';
    } else if (type === 'integer') {
        valueClass = 'integer';
    } else if (type === 'double') {
        valueClass = 'double';
    }
    
    return `
        <div class="property-item">
            <span class="property-name">${name}</span>
            <span class="property-value ${valueClass}">${displayValue}</span>
        </div>
    `;
}

// Create enum options HTML
function createEnumOptions(enumValues) {
    const options = Object.entries(enumValues).map(([key, value]) => `
        <div class="enum-option">
            <span>${key}</span>
            <span class="enum-option-value">${value}</span>
        </div>
    `).join('');
    
    return `
        <div class="enum-options">
            ${options}
        </div>
    `;
}

// Create valid values options HTML
function createValidValuesOptions(validValues) {
    const options = validValues.map(item => {
        const value = item.value?.intValue !== undefined ? item.value.intValue : 
                     item.value?.doubleValue !== undefined ? item.value.doubleValue : 
                     item.value;
        return `
            <div class="enum-option">
                <span>${item.key} ${value}</span>
                <span class="enum-option-value">${item.name}</span>
            </div>
        `;
    }).join('');
    
    return `
        <div class="enum-options">
            <div class="property-item">
                <span class="property-name">Допустимые значения</span>
            </div>
            ${options}
        </div>
    `;
}

// Toggle service expansion
function toggleService(serviceType) {
    const serviceItem = document.querySelector(`[data-service-id="${serviceType}"]`);
    const characteristics = serviceItem.querySelector('.service-characteristics');
    const expandButton = serviceItem.querySelector('.service-expand');
    
    // Close all other services
    document.querySelectorAll('.service-item').forEach(item => {
        if (item !== serviceItem) {
            item.classList.remove('expanded');
            const otherCharacteristics = item.querySelector('.service-characteristics');
            const otherExpandButton = item.querySelector('.service-expand');
            if (otherCharacteristics) {
                otherCharacteristics.classList.remove('expanded');
            }
            if (otherExpandButton) {
                otherExpandButton.classList.remove('expanded');
            }
        }
    });
    
    // Toggle current service
    if (characteristics && expandButton) {
        serviceItem.classList.toggle('expanded');
        characteristics.classList.toggle('expanded');
        expandButton.classList.toggle('expanded');
    }
}

// Toggle characteristic expansion
function toggleCharacteristic(characteristicType) {
    const characteristicItem = document.querySelector(`[data-char-id="${characteristicType}"]`);
    const properties = characteristicItem.querySelector('.characteristic-properties');
    const expandButton = characteristicItem.querySelector('.characteristic-expand');
    
    if (properties && expandButton) {
        characteristicItem.classList.toggle('expanded');
        properties.classList.toggle('expanded');
        expandButton.classList.toggle('expanded');
    }
}

// Add event listeners to service items
function addServiceEventListeners() {
    // Event listeners are added via onclick attributes in the HTML
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('serviceTypesModal');
    const modalContent = modal.querySelector('.modal-select-content');
    
    if (event.target === modal) {
        closeServiceTypesModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    const modal = document.getElementById('serviceTypesModal');
    
    if (event.key === 'Escape' && modal.style.display === 'flex') {
        closeServiceTypesModal();
    }
}); 