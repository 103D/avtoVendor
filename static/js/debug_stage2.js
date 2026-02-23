/**
 * DEBUG MODE для Stage 2
 * Выводит все GET запросы и полученные данные в консоль
 */

class Stage2Debugger {
    constructor() {
        this.requests = [];
        this.responses = [];
        this.init();
    }

    init() {
        console.log("=====================================");
        console.log("🔧 STAGE 2 DEBUG MODE АКТИВИРОВАН");
        console.log("=====================================\n");
        
        // Перехватываем fetch запросы
        this.interceptFetch();
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        
        window.fetch = (...args) => {
            const [url, options] = args;
            
            // Логируем запрос
            console.log("\n📤 OUTGOING REQUEST");
            console.log("─".repeat(50));
            console.log(`URL: ${url}`);
            console.log(`Method: ${(options?.method || 'GET').toUpperCase()}`);
            
            if (options?.body) {
                try {
                    const body = JSON.parse(options.body);
                    console.log("Body:");
                    console.table(body);
                } catch (e) {
                    console.log(`Body: ${options.body}`);
                }
            }
            
            // Вызываем оригинальный fetch и логируем ответ
            return originalFetch.apply(this, args)
                .then(response => {
                    console.log("\n📥 INCOMING RESPONSE");
                    console.log("─".repeat(50));
                    console.log(`Status: ${response.status} ${response.statusText}`);
                    console.log(`Content-Type: ${response.headers.get('content-type')}`);
                    
                    // Клонируем response для логирования
                    return response.clone().json()
                        .then(data => {
                            console.log("Response Data:");
                            console.log(data);
                            
                            // Сохраняем для истории
                            this.responses.push({
                                url,
                                status: response.status,
                                data
                            });
                            
                            // Возвращаем оригинальный ответ
                            return response;
                        })
                        .catch(err => {
                            console.log("Response: (не JSON)");
                            return response;
                        });
                })
                .catch(error => {
                    console.error("\n❌ ERROR:");
                    console.error(error);
                    throw error;
                });
        };
    }

    // Выводит историю всех запросов
    printHistory() {
        console.log("\n\n═════════════════════════════════════════");
        console.log("📊 ИСТОРИЯ ВСЕХ ЗАПРОСОВ");
        console.log("═════════════════════════════════════════\n");
        
        this.responses.forEach((req, idx) => {
            console.log(`\n${idx + 1}. ${req.url}`);
            console.log(`   Status: ${req.status}`);
            console.log(`   Data:`, req.data);
        });
    }

    // Выводит статистику
    printStats() {
        console.log("\n═════════════════════════════════════════");
        console.log("📈 СТАТИСТИКА");
        console.log("═════════════════════════════════════════\n");
        console.log(`Всего запросов: ${this.responses.length}`);
        console.log(`Успешных: ${this.responses.filter(r => r.status === 200).length}`);
        console.log(`Ошибок: ${this.responses.filter(r => r.status !== 200).length}`);
    }
}

// Запускаем отладку
const stage2Debug = new Stage2Debugger();

// Выводим команды для пользователя
console.log("\n📋 ДОСТУПНЫЕ КОМАНДЫ:");
console.log("─".repeat(50));
console.log("stage2Debug.printHistory()  - История всех запросов");
console.log("stage2Debug.printStats()    - Статистика");
console.log("stage2Debug.responses       - Все ответы (array)");
console.log("─".repeat(50) + "\n");
