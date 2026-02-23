class Stage2Manager {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
        this.apiConfig = null;
        this.init();
    }

    getOrCreateSessionId() {
        let id = localStorage.getItem('sessionId');
        if (!id) {
            id = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('sessionId', id);
        }
        return id;
    }

    init() {
        this.loadSavedConfig();
        this.loadInvoiceData(); // Загружаем данные накладной из Stage 1
        this.loadJWTToken(); // Загружаем JWT токен из localStorage
        this.log('✅ Stage 2 готов', 'info');
    }

    loadJWTToken() {
        const jwtToken = localStorage.getItem('jwtToken');
        if (jwtToken) {
            this.apiConfig = { jwt: jwtToken };
            // Скрываем форму логина и показываем кнопку получения товаров
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('getItemsSection').style.display = 'block';
            this.showStatus('✅ Вы авторизованы!', 'success');
        } else {
            this.showStatus('❌ Требуется аутентификация', 'error');
        }
    }

    loadInvoiceData() {
        const invoiceDataStr = localStorage.getItem('invoiceData');
        const invoiceNamesStr = localStorage.getItem('invoiceNames');
        
        if (invoiceDataStr) {
            this.invoiceData = JSON.parse(invoiceDataStr);
        } else {
            this.invoiceData = {};
        }
        
        if (invoiceNamesStr) {
            this.invoiceNames = JSON.parse(invoiceNamesStr);
        } else {
            this.invoiceNames = {};
        }
    }

    loadSavedConfig() {
        fetch(`/api/load-config?session_id=${this.sessionId}`)
            .then(r => r.json())
            .then(d => {
                if (d.config) {
                    // Сохраняем конфиг в localStorage для использования при полном обнулении
                    localStorage.setItem('apiConfig', JSON.stringify(d.config));                    this.log(`✅ Конфиг загружен`, 'success');
                }
            })
            .catch(e => {                this.log(`⚠️ Ошибка: ${e.message}`, 'warning');
            });
    }

    authenticate() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        if (!username || !password) {
            this.showStatus('❌ Заполните имя пользователя и пароль', 'error');
            return;
        }

        this.showStatus('🔍 Аутентификация...', 'loading');
        
        fetch('/api/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                password: password
            })
        })
        .then(r => r.json().then(d => ({status: r.status, data: d})))
        .then(({status, data}) => {
            if (data.success && (data.token || data.jwt_token)) {
                const jwtToken = data.token || data.jwt_token;
                this.apiConfig = { jwt: jwtToken };
                this.showStatus('✅ Аутентификация успешна!', 'success');
                document.getElementById('username').disabled = true;
                document.getElementById('password').disabled = true;
                document.getElementById('btnGetItems').style.display = 'inline-block';
                console.log('✅ JWT токен получен:', jwtToken.substring(0, 20) + '...');
            } else {
                this.showStatus(`❌ ${data.error || 'Ошибка аутентификации'}`, 'error');
            }
        })
        .catch(e => this.showStatus(`❌ ${e.message}`, 'error'));
    }

    getMenuItems() {
        console.log('🔵 getMenuItems() вызвана');
        console.log('📋 invoiceData (SKU из накладной):', Object.keys(this.invoiceData).length, 'товаров');
        console.log('📋 SKU из накладной:', Object.keys(this.invoiceData));
        
        if (!this.apiConfig || !this.apiConfig.jwt) {
            this.showStatus('❌ Сначала выполните аутентификацию', 'error');
            return;
        }

        this.showStatus('⏳ Загрузка товаров...', 'loading');
        document.getElementById('btnGetItems').disabled = true;        console.log('   - JWT токен:', this.apiConfig.jwt.substring(0, 30) + '...');        
        fetch('/api/get-menu-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                jwt_token: this.apiConfig.jwt,
                invoice_data: this.invoiceData,  // Отправляем invoiceData на сервер для фильтрации
                invoice_names: this.invoiceNames  // Отправляем названия товаров
            })
        })
        .then(r => {            return r.json().then(d => ({status: r.status, data: d}));
        })
        .then(({status, data}) => {            
            if (data.success && data.rows) {
                // Показываем первые 5 товаров с сервера для дебага                data.rows.slice(0, 5).forEach(r => console.log(`   SKU: ${r.sku}, Название: ${r.name}, Кол-во: ${r.api_qtn}`));
                
                // Выводим таблицу отсутствующих товаров в консоль браузера
                if (data.missing_items && data.missing_items.length > 0) {
                    console.log(`\n${'='.repeat(80)}`);
                    console.log('📋 ТОВАРЫ ИЗ НАКЛАДНОЙ, ОТСУТСТВУЮЩИЕ НА СЕРВЕРЕ:');
                    console.log(`${'='.repeat(80)}`);
                    console.table(data.missing_items.map((item, idx) => ({
                        'SKU': item.sku,
                        'Название': item.name || 'Не указано',
                        'Количество': item.quantity
                    })));
                    console.log(`Всего товаров отсутствует на сервере: ${data.missing_items.length}`);
                    console.log(`${'='.repeat(80)}\n`);
                }
                
                // Фильтруем товары: оставляем только те, которые есть в накладной (по SKU)
                const notFoundSKUs = [];
                const filteredRows = data.rows.filter(row => {
                    const isInInvoice = this.invoiceData && this.invoiceData[row.sku] !== undefined;
                    if (!isInInvoice) {
                        notFoundSKUs.push(row.sku);
                    }
                    return isInInvoice;
                });                console.log(`   ✓ Товаров в накладной (Stage 1): ${Object.keys(this.invoiceData).length}`);
                console.log(`   ✓ Всего товаров на сервере (API): ${data.total}`);                
                if (notFoundSKUs.length > 0) {
                    console.log(`\n❌ SKU из накладной, которых нет на сервере (первые 10):`);
                    notFoundSKUs.slice(0, 10).forEach(sku => {
                        console.log(`   - ${sku} (в накладной: ${this.invoiceData[sku]})`);
                    });
                    if (notFoundSKUs.length > 10) {                    }
                }                console.log(`   - invoiceData (Stage 1 данные):`, Object.keys(this.invoiceData));
                console.log(`   - Первые 5 товаров с сервера:`, JSON.stringify(data.rows.slice(0, 5), null, 2));
                
                // Проверяем наличие productId
                const hasProductId = data.rows.every(r => r.productId);
                console.log(`   - ✅ Все товары содержат productId: ${hasProductId}`);
                if (!hasProductId) {
                    const missingIds = data.rows.filter(r => !r.productId).slice(0, 3);
                    console.warn(`   - ⚠️ Товары без productId:`, missingIds);
                }                
                this.displayTable(filteredRows);
                this.showStatus(`✅ Загружено ${filteredRows.length} товаров (отфильтровано из ${data.total})`, 'success');
            } else {
                this.showStatus(`❌ ${data.error}`, 'error');
            }
        })
        .catch(e => {            this.showStatus(`❌ ${e.message}`, 'error');
        })
        .finally(() => {
            document.getElementById('btnGetItems').disabled = false;
        });
    }

    displayTable(rows) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        this.currentRows = rows; // Сохраняем rows для отправки
        
        console.log(`\n=== НАЧАЛО displayTable() ===`);        console.log(`📊 Ключи invoiceData:`, Object.keys(this.invoiceData));
        
        rows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            const inputId = `qty_${idx}`;
            const input = document.createElement('input');
            input.type = 'number';
            input.id = inputId;
            input.min = 0;
            input.className = 'qty-input';
            
            // Логируем структуру row для отладки (только для первой строки)
            if (idx === 0) {            }
            
            // Ищем значение по накладной по SKU из Stage 1
            let invoiceQty = row.api_qtn; // Начальное значение - значение с сервера (api_qtn)
            if (this.invoiceData && this.invoiceData[row.sku] !== undefined) {
                invoiceQty = this.invoiceData[row.sku];
                console.log(`   SKU ${row.sku}: Используем значение из накладной = ${invoiceQty}`);
            } else {
                console.log(`   SKU ${row.sku}: Используем значение с сервера = ${row.api_qtn}`);
            }
            
            input.value = invoiceQty; // Начальное значение из накладной
            input.dataset.originalQty = invoiceQty; // Сохраняем исходное значение
            input.dataset.serverQty = row.api_qtn; // Сохраняем значение сервера для справки
            
            // При изменении input обновляем "После добавления"
            input.addEventListener('change', () => this.updateTotal(idx));
            input.addEventListener('input', () => this.updateTotal(idx));
            
            // Вычисляем "После добавления": значение_на_сервере (api_qtn) + введённое_количество (input)
            const totalValue = parseFloat(row.api_qtn) + parseFloat(invoiceQty);
            
            // Значение "На сервере" - это значение api_qtn из GET запроса
            const serverQtyDisplay = row.api_qtn !== undefined ? row.api_qtn : '?';
            const tr_html = `
                <td>${idx + 1}</td>
                <td>${row.sku}</td>
                <td>${row.name}</td>
                <td>${serverQtyDisplay}</td>
                <td id="total_${idx}">${totalValue}</td>
                <td class="edit-column"></td>
            `;
            tr.innerHTML = tr_html;
            tr.querySelector('.edit-column').appendChild(input);
            tbody.appendChild(tr);
        });
        
        console.log(`=== КОНЕЦ displayTable() - отображено ${rows.length} строк ===\n`);
        
        document.getElementById('resultsTable').style.display = 'block';
        document.getElementById('btnSendQty').style.display = 'inline-block';
        document.getElementById('btnResetZero').style.display = 'inline-block';
        document.getElementById('btnMoreOptions').style.display = 'inline-block';
        
        // Добавляем обработчик для открытия/закрытия dropdown меню
        const btnMoreOptions = document.getElementById('btnMoreOptions');
        const dropdownMenu = document.getElementById('dropdownMenu');
        
        if (btnMoreOptions && dropdownMenu) {
            btnMoreOptions.onclick = (e) => {
                e.stopPropagation();
                dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
            };
            
            // Закрываем меню при клике вне его
            document.addEventListener('click', (e) => {
                if (!btnMoreOptions.contains(e.target) && !dropdownMenu.contains(e.target)) {
                    dropdownMenu.style.display = 'none';
                }
            });
        }
    }
    
    updateTotal(idx) {
        const input = document.getElementById(`qty_${idx}`);
        const totalCell = document.getElementById(`total_${idx}`);
        if (input && totalCell && this.currentRows[idx]) {
            const inputQty = parseFloat(input.value) || 0; // Введённое количество (поддерживает дробные числа)
            const serverQty = this.currentRows[idx].api_qtn; // Значение на сервере
            totalCell.textContent = (serverQty + inputQty).toFixed(2); // После добавления = сервер + ввод, с 2 знаками после запятой
        }
    }

    sendQuantities() {
        console.log('🔵 sendQuantities() вызвана');
        
        if (!this.currentRows || this.currentRows.length === 0) {
            this.showStatus('❌ Нет данных для отправки', 'error');
            return;
        }

        // Собираем payload из значений input (передаём значение по накладной)
        const payloads = [];
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const invoiceQty = parseFloat(input.value) || 0; // Поддерживает дробные числа (2.5, 3.75 и т.д.)
                payloads.push({
                    "productId": row.productId,  // productId из /api/get-menu-items
                    "sku": row.sku,
                    "qtn": invoiceQty  // Может быть дробное число
                });
            }
        });

        this.showStatus('⏳ Отправка данных...', 'loading');
        document.getElementById('btnSendQty').disabled = true;
        
        // Логируем входящие payloads перед отправкой
        console.log('\n' + '='.repeat(60));
        console.log('📤 PAYLOADS ОТПРАВЛЯЮТСЯ В /api/update-quantities:');
        console.log('='.repeat(60));
        console.log('Первые 3 записи:', JSON.stringify(payloads.slice(0, 3), null, 2));
        console.log(`Всего: ${payloads.length} записей`);
        console.log('='.repeat(60) + '\n');

        fetch('/api/update-quantities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt_token: this.apiConfig.jwt,
                payloads: payloads
            })
        })
        .then(r => {            return r.json().then(d => ({status: r.status, data: d}));
        })
        .then(({status, data}) => {            if (data.success) {
                this.showStatus(`✅ Отправлено ${data.success_count || payloads.length} товаров`, 'success');
                // Показываем кнопку для перехода к комментариям
                const btnGroup = document.querySelector('#resultsTable .button-group');
                const btnComments = document.createElement('button');
                btnComments.textContent = '📝 Перейти к комментариям';
                btnComments.onclick = () => this.generateComments();
                btnGroup.appendChild(btnComments);
            } else {
                this.showStatus(`❌ ${data.error}`, 'error');
            }
        })
        .catch(e => {            this.showStatus(`❌ ${e.message}`, 'error');
        })
        .finally(() => {
            document.getElementById('btnSendQty').disabled = false;
        });
    }

    generateComments() {
        if (!this.currentRows || this.currentRows.length === 0) {
            this.showStatus('❌ Нет данных для комментариев', 'error');
            return;
        }

        // Собираем только измененные товары
        const changedItems = [];
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const newQty = parseFloat(input.value) || 0; // Поддерживаем дробные числа
                const originalInvoiceQty = parseFloat(input.dataset.originalQty) || 0; // Исходное значение из накладной
                
                // Если количество изменилось (новое != исходное из накладной)
                if (newQty !== originalInvoiceQty) {
                    // Берем название из накладной, если есть, иначе из API
                    let productName = row.name;
                    if (this.invoiceNames && this.invoiceNames[row.sku]) {
                        productName = this.invoiceNames[row.sku];                    }
                    
                    changedItems.push({
                        name: productName,
                        factQty: newQty,
                        invoiceQty: originalInvoiceQty
                    });
                }
            }
        });

        // Генерируем текст комментариев
        let commentsText = '';
        changedItems.forEach(item => {
            commentsText += `${item.name} по факту ${item.factQty}, по накладной ${item.invoiceQty}.\n`;
        });

        document.getElementById('commentsText').value = commentsText.trim();
        document.getElementById('resultsTable').style.display = 'none';
        document.getElementById('commentsStage').style.display = 'block';
    }

    copyComments() {
        const text = document.getElementById('commentsText').value;
        navigator.clipboard.writeText(text).then(() => {
            const successDiv = document.getElementById('copySuccess');
            successDiv.style.display = 'block';
            setTimeout(() => {
                successDiv.style.display = 'none';
            }, 2000);
        });
    }

    backToEdit() {
        document.getElementById('resultsTable').style.display = 'block';
        document.getElementById('commentsStage').style.display = 'none';
    }

    showStatus(msg, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        statusDiv.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    }

    resetAllToZero() {
        if (!this.currentRows || this.currentRows.length === 0) {
            this.showStatus('❌ Нет данных для сброса', 'error');
            return;
        }
        
        if (!confirm(`Вы уверены? Все значения "Отправить кол-во" будут обнулены (${this.currentRows.length} товаров)`)) {
            return;
        }        
        // Обнуляем все input поля
        for (let i = 0; i < this.currentRows.length; i++) {
            const input = document.getElementById(`qty_${i}`);
            if (input) {
                input.value = 0;
                // Вызываем updateTotal чтобы пересчитать "После добавления"
                this.updateTotal(i);
            }
        }        this.showStatus('✅ Все значения "Отправить кол-во" обнулены', 'success');
    }

    resetAllQuantitiesOnServer() {
        if (!this.apiConfig || !this.apiConfig.jwt) {
            this.showStatus('❌ Сначала выполните аутентификацию', 'error');
            return;
        }

        let apiConfig = JSON.parse(localStorage.getItem('apiConfig') || '{}');
        
        if (!apiConfig.jwt_token && this.apiConfig.jwt) {
            apiConfig.jwt_token = this.apiConfig.jwt;
        }
        
        if (!apiConfig.jwt_token && !this.apiConfig.jwt) {
            this.showStatus('❌ JWT токен не найден', 'error');
            return;
        }

        // Добавляем URLs если их нет в apiConfig
        if (!apiConfig.url_menus) {
            apiConfig.url_menus = 'https://orderconfirmer-api.safiadelivery.com/api/menu/Menus';
        }
        if (!apiConfig.url_change_qty) {
            apiConfig.url_change_qty = 'https://orderconfirmer-api.safiadelivery.com/api/menu/ChangeQuantity';
        }
        
        let urlMenus = apiConfig.url_menus;
        if (!confirm('🚨 ВНИМАНИЕ!\n\nВы уверены, что хотите ОБНУЛИТЬ ВСЕ ПОЗИЦИИ НА СЕРВЕРЕ?\n\nЭто действие необратимо!')) {
            return;
        }

        this.showStatus('⏳ Обнуление всех позиций на сервере...', 'loading');
        const btn = document.getElementById('btnResetServerQty');
        if (btn) btn.disabled = true;
        // 1. Получаем ВСЕ товары с сервера
        const jwtToken = this.apiConfig.jwt || apiConfig.jwt_token;        console.log('🔑 JWT token:', jwtToken.substring(0, 30) + '...');
        
        fetch(urlMenus, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Content-Type': 'application/json'
            }
        })
        .then(r => {            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        })
        .then(serverData => {            
            // 2. Собираем payloads с отрицательными значениями
            const payloads = [];
            let totalItems = 0;
            const debugItems = [];  // Для логирования первых 5 товаров
            
            if (serverData.data && Array.isArray(serverData.data)) {
                for (let category of serverData.data) {
                    if (category.products && Array.isArray(category.products)) {
                        for (let product of category.products) {
                            const sku = product.sku;
                            let qtn = product.qtn;
                            
                            // Убеждаемся что qtn - это число
                            if (typeof qtn === 'string') {
                                qtn = parseFloat(qtn);
                            }
                            
                            if (sku && qtn > 0) {
                                const negQtn = -qtn;  // Это число, не строка
                                payloads.push({
                                    "productId": product.productId,  // productId из API response
                                    "sku": sku,
                                    "qtn": negQtn  // Отрицательное значение
                                });
                                
                                if (totalItems < 5) {
                                    debugItems.push({
                                        sku: sku,
                                        originalQtn: product.qtn,
                                        parsedQtn: qtn,
                                        sendingQtn: negQtn,
                                        type: typeof negQtn
                                    });
                                }
                                totalItems++;
                            }
                        }
                    }
                }
            }            console.log('🔍 Первые 5 товаров (для проверки дробных):');            
            if (!payloads.length) {
                this.showStatus('❌ Нет товаров для обнуления', 'error');
                if (btn) btn.disabled = false;
                return;
            }
            
            // 3. Отправляем отрицательные значения на сервер
            // ИСПОЛЬЗУЕМ ПОЛНЫЙ URL, а НЕ из конфига!
            const urlChange = 'https://orderconfirmer-api.safiadelivery.com/api/menu/ChangeQuantity';            
            return fetch(urlChange, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${jwtToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payloads)
            }).then(r => {                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            }).then(response => {
                this.showStatus(`✅ УСПЕШНО! Обнулено ${totalItems} товаров на сервере!`, 'success');            });
        })
        .catch(e => {            this.showStatus(`❌ ${e.message}`, 'error');
        })
        .finally(() => {
            if (btn) btn.disabled = false;
        });
    }

    reset() {
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('username').disabled = false;
        document.getElementById('password').disabled = false;
        document.getElementById('statusMessage').innerHTML = '';
        document.getElementById('resultsTable').style.display = 'none';
        document.getElementById('tableBody').innerHTML = '';
        document.getElementById('btnGetItems').style.display = 'none';
        document.getElementById('btnSendQty').style.display = 'none';
        document.getElementById('btnResetZero').style.display = 'none';
        document.getElementById('commentsStage').style.display = 'none';
        this.apiConfig = null;
        this.currentRows = null;
    }

    log(msg, type = 'info') {
        console.log(`[${type.toUpperCase()}]`, msg);
    }
}

// Глобальная переменная для доступа из onclick атрибутов
let stage2Manager;

document.addEventListener('DOMContentLoaded', () => {
    stage2Manager = new Stage2Manager();
});
