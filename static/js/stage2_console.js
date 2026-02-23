/**
 * STAGE 2 - Красивый вывод данных в консоль
 * Используется для отладки и демонстрации GET запросов
 */

console.log("\n╔═══════════════════════════════════════════════════════════════════════════╗");
console.log("║                    🔗 STAGE 2: API ИНТЕГРАЦИЯ                            ║");
console.log("║              Выводит все GET запросы и полученные данные               ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════╝\n");

// Функция для красивого вывода заголовков
function printHeader(title) {
    console.log("\n" + "═".repeat(80));
    console.log(`   ${title}`);
    console.log("═".repeat(80));
}

// Функция для вывода таблицы товаров
function printItemsTable(items) {
    console.log("\n📊 ТАБЛИЦА ТОВАРОВ:");
    console.log("─".repeat(80));
    
    const table = items.map((item, idx) => ({
        "№": idx + 1,
        "SKU": item.sku || "—",
        "Название": (item.nameRu || item.name || "—").substring(0, 30),
        "На сервере": item.qtn || 0,
        "По факту": item.qtn_fact || 0,
        "Итого": (item.qtn || 0) + (item.qtn_fact || 0)
    }));
    
    console.table(table);
}

// Функция для вывода структуры API ответа
function printAPIStructure(data) {
    printHeader("📋 СТРУКТУРА API ОТВЕТА");
    
    console.log("\nОсновные поля:");
    console.log(`  • success: ${data.success}`);
    console.log(`  • total: ${data.total}`);
    console.log(`  • message: ${data.message}`);
    console.log(`  • categories: ${data.data ? data.data.length : 0}`);
    
    if (data.data && data.data.length > 0) {
        console.log("\n🏷️ КАТЕГОРИИ:");
        data.data.forEach((cat, idx) => {
            console.log(`\n  ${idx + 1}. ${cat.nameRu || cat.name}`);
            console.log(`     └─ Товаров: ${cat.products ? cat.products.length : 0}`);
            
            if (cat.products && cat.products.length > 0) {
                cat.products.slice(0, 3).forEach((p, pidx) => {
                    console.log(`        ${pidx + 1}. ${p.sku} - ${p.nameRu || p.name} (qtn: ${p.qtn})`);
                });
                if (cat.products.length > 3) {
                    console.log(`        ... ещё ${cat.products.length - 3} товаров`);
                }
            }
        });
    }
}

// Функция для красивого логирования JSON
function printJSON(title, data) {
    printHeader(title);
    console.log(JSON.stringify(data, null, 2));
}

// Объект для сбора информации о запросах
window.Stage2API = {
    lastRequest: null,
    lastResponse: null,
    allRequests: [],
    
    // Выводит последний GET запрос
    showLastRequest() {
        if (this.lastRequest) {
            printHeader("📤 ПОСЛЕДНИЙ GET ЗАПРОС");
            console.log("\n🔗 URL:", this.lastRequest.url);
            console.log("🔑 Метод:", this.lastRequest.method);
            console.log("\n📦 BODY:");
            console.table(this.lastRequest.body);
        } else {
            console.warn("⚠️ Запросов ещё не было");
        }
    },
    
    // Выводит последний ответ API
    showLastResponse() {
        if (this.lastResponse) {
            printHeader("📥 ПОСЛЕДНИЙ ОТВЕТ API");
            console.log("\n✅ Статус:", this.lastResponse.status);
            console.log("📊 Данные:");
            console.log(this.lastResponse.data);
            
            // Если это GET запрос с товарами
            if (this.lastResponse.data.data && Array.isArray(this.lastResponse.data.data)) {
                printAPIStructure(this.lastResponse.data);
            }
        } else {
            console.warn("⚠️ Ответов ещё не было");
        }
    },
    
    // Выводит все товары из последнего ответа
    showItems() {
        if (this.lastResponse && this.lastResponse.data.data) {
            const allItems = [];
            this.lastResponse.data.data.forEach(cat => {
                if (cat.products) {
                    allItems.push(...cat.products);
                }
            });
            
            printHeader(`📦 ВСЕ ТОВАРЫ (${allItems.length} шт.)`);
            console.table(allItems.map((item, idx) => ({
                "№": idx + 1,
                "SKU": item.sku,
                "Название": (item.nameRu || item.name).substring(0, 40),
                "Кол-во": item.qtn,
                "Цена": item.price || "—"
            })));
        } else {
            console.warn("⚠️ Товаров не найдено");
        }
    },
    
    // Выводит отфильтрованные товары
    showFiltered() {
        if (this.lastResponse && this.lastResponse.data.qtn_map) {
            printHeader("🎯 ОТФИЛЬТРОВАННЫЕ ТОВАРЫ (из Stage 1)");
            console.log("\n📍 Товары, которые остались после фильтрации:\n");
            
            const filtered = [];
            this.lastResponse.data.data.forEach(cat => {
                if (cat.products) {
                    cat.products.forEach(p => {
                        filtered.push({
                            "SKU": p.sku,
                            "Название": p.nameRu || p.name,
                            "На сервере": p.qtn,
                            "По факту": this.lastResponse.data.qtn_map[p.sku] || 0,
                            "Итого": (p.qtn || 0) + (this.lastResponse.data.qtn_map[p.sku] || 0)
                        });
                    });
                }
            });
            
            console.table(filtered);
            console.log(`\nВсего отфильтровано: ${filtered.length} товаров`);
        } else {
            console.warn("⚠️ Отфильтрованные товары не найдены");
        }
    },
    
    // История всех запросов
    showHistory() {
        printHeader("📜 ИСТОРИЯ ВСЕХ ЗАПРОСОВ");
        this.allRequests.forEach((req, idx) => {
            console.log(`\n${idx + 1}. ${req.url}`);
            console.log(`   ✅ Статус: ${req.status}`);
            console.log(`   📦 Товаров: ${req.itemCount || "—"}`);
            console.log(`   🕐 Время: ${req.timestamp}`);
        });
    },
    
    // Статистика запросов
    showStats() {
        printHeader("📈 СТАТИСТИКА");
        console.log(`\nВсего запросов: ${this.allRequests.length}`);
        console.log(`Успешных (200): ${this.allRequests.filter(r => r.status === 200).length}`);
        console.log(`Ошибок: ${this.allRequests.filter(r => r.status !== 200).length}`);
        
        if (this.lastResponse && this.lastResponse.data.data) {
            const totalItems = this.lastResponse.data.data.reduce((sum, cat) => {
                return sum + (cat.products ? cat.products.length : 0);
            }, 0);
            console.log(`\nТоваров в API: ${totalItems}`);
            console.log(`Фильтрованных: ${Object.keys(this.lastResponse.data.qtn_map || {}).length}`);
        }
    },
    
    // Запись информации о запросе
    logRequest(url, body) {
        this.lastRequest = {
            url,
            body,
            method: "POST",
            timestamp: new Date().toLocaleTimeString()
        };
        console.log(`\n📤 GET ЗАПРОС: ${url}`);
        if (body) console.table(body);
    },
    
    // Запись информации об ответе
    logResponse(status, data) {
        this.lastResponse = {
            status,
            data,
            timestamp: new Date().toLocaleTimeString()
        };
        
        let itemCount = 0;
        if (data.data && Array.isArray(data.data)) {
            itemCount = data.data.reduce((sum, cat) => {
                return sum + (cat.products ? cat.products.length : 0);
            }, 0);
        }
        
        this.allRequests.push({
            status,
            itemCount,
            timestamp: new Date().toLocaleTimeString()
        });
        
        console.log(`✅ ОТВЕТ API: ${status} OK`);
        console.log(`📊 Товаров: ${itemCount}`);
    }
};

// Выводим справку
console.log("\n📋 ДОСТУПНЫЕ КОМАНДЫ:");
console.log("─".repeat(80));
console.log("Stage2API.showLastRequest()    → Показать последний GET запрос");
console.log("Stage2API.showLastResponse()   → Показать последний ответ API");
console.log("Stage2API.showItems()          → Показать все товары из API");
console.log("Stage2API.showFiltered()       → Показать отфильтрованные товары");
console.log("Stage2API.showHistory()        → История всех запросов");
console.log("Stage2API.showStats()          → Статистика");
console.log("─".repeat(80) + "\n");
