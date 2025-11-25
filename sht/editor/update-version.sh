#!/bin/bash

# Скрипт для обновления версии кэша во всех ресурсах
# Использование: ./update-version.sh [новая_версия]
# Пример: ./update-version.sh 1.0.2
# Если версия не указана - инкрементируется минорная версия из version.json

# Генерируем build из текущей даты и времени (формат: 20251125163740)
BUILD_DATE=$(date +%Y%m%d%H%M%S)

# Получаем версию
if [ -z "$1" ]; then
    # Если аргумент не передан - читаем текущую версию из version.json и инкрементируем
    if [ -f "version.json" ]; then
        CURRENT_VERSION=$(grep '"version"' version.json | sed 's/.*"\([0-9.]*\)".*/\1/')
        # Инкрементируем минорную версию (1.0.0 -> 1.0.1, 1.0.9 -> 1.0.10)
        MAJOR=$(echo $CURRENT_VERSION | cut -d. -f1)
        MINOR=$(echo $CURRENT_VERSION | cut -d. -f2)
        PATCH=$(echo $CURRENT_VERSION | cut -d. -f3)
        PATCH=$((PATCH + 1))
        VERSION_NUM="$MAJOR.$MINOR.$PATCH"
    else
        # Если version.json не найден - используем 1.0.0
        VERSION_NUM="1.0.0"
    fi
else
    # Используем переданную версию
    VERSION_NUM="$1"
fi

NEW_VERSION="v=$VERSION_NUM-$BUILD_DATE"

echo "Обновление версии кэша:"
echo "  Версия: $VERSION_NUM"
echo "  Build: $BUILD_DATE"
echo "  Полная версия: $NEW_VERSION"
echo ""

# Обновляем версию в index.html
if [ -f "index.html" ]; then
    # Заменяем версии в URL-параметрах (после ?)
    # Формат: file.js?v=старая_версия -> file.js?v=новая_версия
    sed -i '' "s/\?v=[0-9a-zA-Z._-]*/?v=$VERSION_NUM-$BUILD_DATE/g" index.html
    
    # Заменяем версии в JavaScript строках
    # Формат: 'v=старая_версия' -> 'v=новая_версия'
    # Формат: "v=старая_версия" -> "v=новая_версия"
    sed -i '' "s/'v=[^']*'/'v=$VERSION_NUM-$BUILD_DATE'/g" index.html
    sed -i '' "s/\"v=[^\"]*\"/\"v=$VERSION_NUM-$BUILD_DATE\"/g" index.html
    
    echo "✓ Обновлен index.html"
else
    echo "✗ Файл index.html не найден"
fi

# Обновляем версию в version.json
if [ -f "version.json" ]; then
    cat > version.json << EOF
{
  "version": "$VERSION_NUM",
  "build": "$BUILD_DATE"
}
EOF
    echo "✓ Обновлен version.json"
else
    echo "✗ Файл version.json не найден"
fi

echo ""
echo "✅ Версия успешно обновлена!"
echo "   Используйте: $NEW_VERSION"
echo ""
echo "Не забудьте закоммитить изменения!"

