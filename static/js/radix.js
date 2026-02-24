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
        this.newProducts = []; // Массив для хранения добавленных вручную товаров
        this.selectedProduct = null; // Выбранный товар для добавления
        this.selectedDocument = ''; // Выбранный документ в модальном окне
        this.searchTimeout = null; // Таймаут для поиска
        this.sentTotals = {}; // { "sku|doc": totalSent }
        this.loadJWTToken(); // Загружаем JWT токен из localStorage
        this.loadSavedUsername(); // Загружаем сохраненный логин и заполняем поле
        this.log('✅ Stage 2 готов', 'info');
    }

    loadJWTToken() {
        const jwtToken = localStorage.getItem('jwtToken');
        console.log('🔍 Проверка JWT токена:', jwtToken ? 'Найден' : 'Не найден');
        
        if (jwtToken) {
            this.apiConfig = { jwt: jwtToken };
            // Скрываем форму логина и автоматически загружаем товары
            document.getElementById('login-section').style.display = 'none';
            this.showStatus('✅ Вы авторизованы!', 'success');
            console.log('✅ Токен найден, форма логина скрыта');
            // Автоматически загружаем товары
            setTimeout(() => this.getMenuItems(), 500);
        } else {
            console.log('❌ Токен не найден, показываем форму логина');
            document.getElementById('login-section').style.display = 'block';
            this.showStatus('❌ Требуется аутентификация', 'error');
        }
    }

    loadSavedUsername() {
        const savedLogin = localStorage.getItem('accountLogin');
        if (savedLogin) {
            const usernameInput = document.getElementById('username');
            if (usernameInput) {
                usernameInput.value = savedLogin;
                console.log('📝 Загружен сохраненный логин из localStorage:', savedLogin);
            }
        }
    }

    getAccountLogin() {
        // Всегда используем текущий логин из поля (если он активен)
        const input = document.getElementById('username');
        if (input && input.value.trim()) {
            console.log('📝 getAccountLogin из поля input:', input.value.trim());
            return input.value.trim();
        }
        // Иначе берем из localStorage
        const savedLogin = localStorage.getItem('accountLogin');
        if (savedLogin) {
            console.log('📝 getAccountLogin из localStorage:', savedLogin);
            return savedLogin;
        }
        console.log('📝 getAccountLogin - используется "неизвестно"');
        return 'неизвестно';
    }

    getDocumentNumbers() {
        if (Array.isArray(this.documentNumbers) && this.documentNumbers.length > 0) {
            return this.documentNumbers;
        }

        const docs = new Set();
        if (Array.isArray(this.currentRows)) {
            this.currentRows.forEach(row => {
                if (row && row.document_number) {
                    docs.add(row.document_number);
                }
            });
        }
        return Array.from(docs);
    }

    notifyTelegram(action) {
        const login = this.getAccountLogin();
        const docs = this.getDocumentNumbers();
        const payload = {
            action: action,
            account_login: login,
            document_numbers: docs,
            branch: 'Сдоба',
            clicked_at: new Date().toLocaleString('ru-RU')
        };

        console.log('📤 Telegram отправка:', { login, docs, action });

        fetch('/api/notify-telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                console.warn(`⚠️ Telegram: ${data.error || 'не удалось отправить уведомление'}`);
            } else {
                console.log(`✅ Telegram отправлен: логин="${login}", действие="${action}"`);
            }
        })
        .catch(e => {
            console.warn(`⚠️ Telegram: ${e.message}`);
        });
    }

    loadInvoiceData() {
        const invoiceDataStr = localStorage.getItem('invoiceData');
        const invoiceNamesStr = localStorage.getItem('invoiceNames');
        const documentNumbersStr = localStorage.getItem('documentNumbers');
        const exordModeStr = localStorage.getItem('exordMode');
        const exordColumnStr = localStorage.getItem('exordColumn');
        
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
        
        if (documentNumbersStr) {
            this.documentNumbers = JSON.parse(documentNumbersStr);
        } else {
            this.documentNumbers = [];
        }

        this.exordMode = exordModeStr === '1';
        this.exordColumn = (exordColumnStr || 'отправлено').toLowerCase();
        this.isExordDeliveredMode = this.exordMode && this.exordColumn === 'доставлено';
        this.isExordSentMode = this.exordMode && this.exordColumn === 'отправлено';
        
        if (this.documentNumbers && this.documentNumbers.length > 0) {
            console.log(`📋 Номера документов загружены: ${this.documentNumbers.join(', ')}`);
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
        console.log('🔵 authenticate() вызвана в Stage2Manager (Radix mode)');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        console.log(`📝 Попытка входа: username="${username}"`);
        
        if (!username || !password) {
            console.log('❌ Поля пусты');
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
            console.log('🔵 Ответ от /api/get-token:', { status, success: data.success });
            if (data.success && (data.token || data.jwt_token)) {
                const jwtToken = data.token || data.jwt_token;
                this.apiConfig = { jwt: jwtToken };
                this.showStatus('✅ Аутентификация успешна!', 'success');
                document.getElementById('username').disabled = true;
                document.getElementById('password').disabled = true;
                // Очищаем старый логин и устанавливаем новый
                console.log('🧹 Удаляю старый accountLogin из localStorage');
                localStorage.removeItem('accountLogin');
                console.log('💾 Сохраняю новый accountLogin:', username);
                localStorage.setItem('accountLogin', username);
                console.log('✅ Новый логин сохранён в localStorage:', username);
                console.log('✅ JWT токен получен:', jwtToken.substring(0, 20) + '...');
                // Автоматически загружаем товары
                setTimeout(() => this.getMenuItems(), 500);
            } else {
                console.log('❌ Ошибка аутентификации:', data.error);
                this.showStatus(`❌ ${data.error || 'Ошибка аутентификации'}`, 'error');
            }
        })
        .catch(e => {
            console.log('❌ Ошибка fetch:', e.message);
            this.showStatus(`❌ ${e.message}`, 'error');
        });
    }

    getMenuItems() {
        console.log('🔵 getMenuItems() вызвана');
        console.log('📋 invoiceData (SKU из накладной):', Object.keys(this.invoiceData).length, 'товаров');
        console.log('📋 SKU из накладной:', Object.keys(this.invoiceData));
        
        if (!this.apiConfig || !this.apiConfig.jwt) {
            this.showStatus('❌ Сначала выполните аутентификацию', 'error');
            return;
        }

        this.showStatus('⏳ Загрузка товаров...', 'loading');        console.log('   - JWT токен:', this.apiConfig.jwt.substring(0, 30) + '...');        
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
        });
    }

    displayTable(rows) {
        const tbody = document.getElementById('tableBody');
        const previousValues = {};
        if (this.currentRows) {
            this.currentRows.forEach((row, idx) => {
                const input = document.getElementById(`qty_${idx}`);
                if (input) {
                    const key = `${row.sku}|${row.document_number || ''}`;
                    previousValues[key] = input.value;
                }
            });
        }
        tbody.innerHTML = '';
        
        // Добавляем document_number к каждому row из transformedData (если доступны)
        const transformedDataStr = localStorage.getItem('transformedData');
        const documentMapping = {}; // { sku: document_number }
        const exordQtyByKey = {}; // { "sku|doc": { sent, delivered } }
        const exordQtyBySku = {}; // fallback: { "sku": { sent, delivered } }
        
        if (transformedDataStr) {
            try {
                const transformedData = JSON.parse(transformedDataStr);
                transformedData.forEach(item => {
                    if (item.sku && item.document_number) {
                        documentMapping[item.sku] = item.document_number;
                        exordQtyByKey[`${item.sku}|${item.document_number}`] = {
                            sent: item.qtn_sent,
                            delivered: item.qtn_delivered
                        };
                    }
                    if (item.sku && !exordQtyBySku[item.sku]) {
                        exordQtyBySku[item.sku] = {
                            sent: item.qtn_sent,
                            delivered: item.qtn_delivered
                        };
                    }
                });
                console.log(`📋 Загруженно ${Object.keys(documentMapping).length} товаров с номерами документов`);
            } catch (e) {
                console.warn('⚠️  Не удалось распарсить transformedData из localStorage:', e);
            }
        }
        
        // Добавляем document_number к каждому row из API
        rows.forEach(row => {
            if (documentMapping[row.sku]) {
                row.document_number = documentMapping[row.sku];
            }

            const rowKey = `${row.sku}|${row.document_number || ''}`;
            const exordQty = exordQtyByKey[rowKey] || exordQtyBySku[row.sku];
            if (exordQty) {
                row.qtn_sent = exordQty.sent;
                row.qtn_delivered = exordQty.delivered;
            }
        });
        
        // Объединяем товары API с новыми вручную добавленными товарами
        const allRows = [...rows, ...this.newProducts];
        this.currentRows = allRows; // Сохраняем all rows для отправки
        
        console.log(`\n=== НАЧАЛО displayTable() ===`);
        console.log(`📊 Товаров с API: ${rows.length}, Новых товаров: ${this.newProducts.length}`);
        
        allRows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            const inputId = `qty_${idx}`;
            const input = document.createElement('input');
            input.type = 'number';
            input.id = inputId;
            input.min = 0;
            input.className = 'qty-input';
            
            // Ищем значение по накладной по SKU из Stage 1
            let invoiceQty = row.api_qtn || row.invoice_qty; // invoice_qty для новых товаров
            if (!row.isNew && this.invoiceData && this.invoiceData[row.sku] !== undefined) {
                invoiceQty = this.invoiceData[row.sku];
                console.log(`   SKU ${row.sku}: Используем значение из накладной = ${invoiceQty}`);
            } else if (!row.isNew) {
                console.log(`   SKU ${row.sku}: Используем значение с сервера = ${row.api_qtn}`);
            }
            if (row.isNew) {
                invoiceQty = 0;
            }

            const key = `${row.sku}|${row.document_number || ''}`;
            let inputValue = previousValues[key];
            if (inputValue === undefined) {
                if (row.isNew && row.fact_qty !== undefined && row.fact_qty !== null) {
                    inputValue = row.fact_qty;
                } else {
                    inputValue = 0;
                }
            }
            input.value = inputValue;
            input.dataset.originalQty = invoiceQty; // Сохраняем исходное значение
            input.dataset.serverQty = row.api_qtn || row.invoice_qty || 0;
            input.dataset.sentQty = row.qtn_sent ?? '';
            input.dataset.deliveredQty = row.qtn_delivered ?? '';
            input.dataset.isExordSentMode = this.isExordSentMode ? '1' : '0';
            input.addEventListener('input', () => this.updateFactInputHighlight(input));
            
            // Вычисляем "По накладной": значение из Stage 1
            const invoiceQtyDisplay = invoiceQty !== undefined ? invoiceQty : '?';

            const totalSent = this.sentTotals[key] || 0;
            const serverQtyDisplay = (invoiceQtyDisplay !== '?')
                ? (totalSent - Number(invoiceQtyDisplay))
                : totalSent;
            
            // Подсвечиваем новые товары
            const rowStyle = row.isNew ? 'background-color: #fff8dc; font-weight: 500;' : '';
            const newBadge = row.isNew ? ' <span style="color: #f39c12; font-weight: bold;">[НОВЫЙ]</span>' : '';
            
            const tr_html = `
                <td style="${rowStyle}">${idx + 1}</td>
                <td style="${rowStyle}">${row.sku}</td>
                <td style="${rowStyle}">${row.name}${newBadge}</td>
                <td style="${rowStyle}" data-col="sent-diff">${serverQtyDisplay}</td>
                <td style="${rowStyle}">${invoiceQtyDisplay}</td>
                <td class="edit-column" style="${rowStyle}"></td>
                <td style="${rowStyle}"></td>
            `;
            tr.innerHTML = tr_html;
            tr.querySelector('.edit-column').appendChild(input);

            const sendCell = tr.querySelector('td:last-child');
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.textContent = 'Отправить';
            sendBtn.style.padding = '6px 10px';
            sendBtn.style.fontSize = '12px';
            sendBtn.style.margin = '0';
            sendBtn.style.background = '#2ecc71';
            sendBtn.style.borderColor = '#2ecc71';
            sendBtn.style.color = '#fff';
            sendBtn.addEventListener('click', () => this.sendRowQuantity(row, input));
            sendCell.appendChild(sendBtn);

            tbody.appendChild(tr);
            this.updateFactInputHighlight(input);
        });
        
        console.log(`=== КОНЕЦ displayTable() - отображено ${allRows.length} строк ===\n`);
        
        document.getElementById('resultsTable').style.display = 'block';
        const btnComments = document.getElementById('btnCommentsOnly');
        if (btnComments) btnComments.style.display = 'inline-block';
        const btnAdd = document.getElementById('btnAddProduct');
        if (btnAdd) btnAdd.style.display = 'inline-block';
    }

    updateFactInputHighlight(input) {
        if (!input) return;

        const row = input.closest('tr');

        const sentTotalRaw = (input.dataset.sentTotal ?? '').toString().trim();
        const sentTotal = parseFloat(sentTotalRaw);
        const factQty = !Number.isNaN(sentTotal) ? sentTotal : parseFloat(input.value);

        const hasUserInput = !Number.isNaN(factQty) && factQty > 0;

        if (row) {
            if (hasUserInput) {
                row.classList.add('row-warning');
            } else {
                row.classList.remove('row-warning');
            }
        }
    }

    sendRowQuantity(row, input) {
        if (!row || !input) return;
        if (!this.apiConfig || !this.apiConfig.jwt) {
            this.showStatus('❌ Сначала выполните аутентификацию', 'error');
            return;
        }

        const qty = parseFloat(input.value);
        if (Number.isNaN(qty) || qty <= 0) {
            alert('❌ Введите количество больше 0');
            return;
        }

        this.showStatus('⏳ Отправка позиции...', 'loading');

        fetch('/api/update-quantities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt_token: this.apiConfig.jwt,
                payloads: [{
                    productId: row.productId,
                    sku: row.sku,
                    qtn: qty
                }],
                document_numbers: this.documentNumbers || []
            })
        })
        .then(r => r.json().then(d => ({status: r.status, data: d})))
        .then(({status, data}) => {
            if (data.success) {
                const key = `${row.sku}|${row.document_number || ''}`;
                const prev = this.sentTotals[key] || 0;
                this.sentTotals[key] = prev + qty;
                input.dataset.sentTotal = this.sentTotals[key];
                input.value = 0;
                this.updateFactInputHighlight(input);
                const tr = input.closest('tr');
                if (tr) {
                    const invoiceQty = parseFloat(input.dataset.originalQty);
                    const invoiceVal = Number.isNaN(invoiceQty) ? 0 : invoiceQty;
                    const sentDiff = this.sentTotals[key] - invoiceVal;
                    const sentCell = tr.querySelector('[data-col="sent-diff"]');
                    if (sentCell) {
                        sentCell.textContent = sentDiff;
                    }
                }
                this.showStatus(`✅ Отправлено ${qty}`, 'success');
            } else {
                this.showStatus(`❌ ${data.error || 'Ошибка отправки'}`, 'error');
            }
        })
        .catch(e => this.showStatus(`❌ ${e.message}`, 'error'));
    }
    
    updateTotal(idx) {
        // Функция больше не нужна, так как убрали столбец "После добавления"
        // Оставляем пустой для совместимости
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
                payloads: payloads,
                document_numbers: this.documentNumbers || []
            })
        })
        .then(r => {            return r.json().then(d => ({status: r.status, data: d}));
        })
        .then(({status, data}) => {            if (data.success) {
                alert(`✅ Успешно отправлено ${data.success_count || payloads.length} товаров!`);
                this.showStatus('', 'success');
                
                // Логируем изменения в историю
                this.logChanges(payloads);

            this.notifyTelegram('send_all');

                // Сохраняем payloads для использования в returnQuantities
                this.lastPayloads = payloads;

                // Показываем кнопки для перехода к комментариям и возврата товаров
                const btnGroup = document.querySelector('#resultsTable .button-group');
                if (btnGroup) {
                    let btnComments = document.getElementById('btnComments');
                    if (!btnComments) {
                        btnComments = document.createElement('button');
                        btnComments.id = 'btnComments';
                        btnComments.textContent = '📝 Перейти к комментариям';
                        btnComments.style.marginLeft = '10px';
                        btnComments.onclick = () => this.generateComments();
                        btnGroup.appendChild(btnComments);
                    }

                    let btnReturn = document.getElementById('btnReturnQty');
                    if (!btnReturn) {
                        btnReturn = document.createElement('button');
                        btnReturn.id = 'btnReturnQty';
                        btnReturn.textContent = '↩️ Вернуть товары';
                        btnReturn.style.marginLeft = '10px';
                        btnReturn.style.background = '#ff9800';
                        btnReturn.onclick = () => this.returnQuantities();
                        btnGroup.appendChild(btnReturn);
                    }
                }
            } else {
                alert('❌ ' + data.error);
                this.showStatus('', 'error');
            }
        })
        .catch(e => {            alert('❌ ' + e.message);
            this.showStatus('', 'error');
        })
        .finally(() => {
            document.getElementById('btnSendQty').disabled = false;
        });
    }

    generateCommentsOnly() {
        this.showStatus('📝 Сформированы только комментарии (без отправки на сервер)', 'success');
        this.notifyTelegram('comments_only');
        this.generateComments();
    }

    logChanges(payloads) {
        console.log('📝 Логирование изменений...');
        
        // Собираем измененные товары с полной информацией и группируем по документам
        const changedByDocument = {}; // { "11813": [...], "11814": [...] }
        
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const factQty = parseFloat(input.value) || 0;
                const invoiceQty = parseFloat(input.dataset.originalQty) || 0;
                
                // Логируем измененные товары ИЛИ новые товары
                if (factQty !== invoiceQty || row.isNew) {
                    let productName = row.name;
                    if (this.invoiceNames && this.invoiceNames[row.sku]) {
                        productName = this.invoiceNames[row.sku];
                    }
                    
                    const docNum = row.document_number || 'unknown';
                    if (!changedByDocument[docNum]) {
                        changedByDocument[docNum] = [];
                    }
                    
                    const changeRecord = {
                        sku: row.sku,
                        name: productName,
                        fact_qty: factQty,
                        invoice_qty: invoiceQty
                    };
                    
                    // Добавляем пометку если это новый товар
                    if (row.isNew) {
                        changeRecord.is_new_product = true;
                    }
                    
                    changedByDocument[docNum].push(changeRecord);
                }
            }
        });
        
        const totalChanges = Object.values(changedByDocument).reduce((sum, arr) => sum + arr.length, 0);
        if (totalChanges === 0) {
            console.log('   Нет изменений для логирования');
            return;
        }
        
        // Отправляем запрос на логирование с группировкой по документам
        fetch('/api/log-comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: this.sessionId,
                items: changedByDocument,
                document_numbers: this.documentNumbers || []
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                console.log(`✅ Записано ${totalChanges} изменений в историю`);
                for (const docNum in changedByDocument) {
                    console.log(`   📋 Документ ${docNum}: ${changedByDocument[docNum].length} изменений`);
                }
                if (data.total_records) {
                    console.log(`   Всего записей: ${data.total_records}`);
                }
            } else {
                console.warn(`⚠️ Ошибка логирования: ${data.error}`);
            }
        })
        .catch(e => {
            console.error(`❌ Ошибка при логировании: ${e.message}`);
        });
    }

    generateComments() {
        if (!this.currentRows || this.currentRows.length === 0) {
            this.showStatus('❌ Нет данных для комментариев', 'error');
            return;
        }

        // Собираем измененные товары, группированные по документам
        const changedByDocument = {}; // { "11813": [...], "11814": [...] }
        
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const key = `${row.sku}|${row.document_number || ''}`;
                const sentTotal = this.sentTotals[key] || 0;
                const newQty = sentTotal;
                const originalInvoiceQty = parseFloat(input.dataset.originalQty) || 0;
                const sentQty = row.qtn_sent;
                const deliveredQty = row.qtn_delivered;
                const sentHasNumber = sentQty !== undefined && sentQty !== null && sentQty !== '' && !Number.isNaN(Number(sentQty));
                const deliveredHasNumber = deliveredQty !== undefined && deliveredQty !== null && deliveredQty !== '' && !Number.isNaN(Number(deliveredQty));
                const hasSentDeliveredDifference = sentHasNumber && deliveredHasNumber
                    ? Number(sentQty) !== Number(deliveredQty)
                    : (sentHasNumber !== deliveredHasNumber);
                
                // Если количество изменилось ИЛИ это новый товар ИЛИ есть расхождение Отправлено/Доставлено
                if (newQty !== originalInvoiceQty || row.isNew || hasSentDeliveredDifference) {
                    let productName = row.name;
                    if (this.invoiceNames && this.invoiceNames[row.sku]) {
                        productName = this.invoiceNames[row.sku];
                    }
                    
                    const docNum = row.document_number || 'unknown';
                    if (!changedByDocument[docNum]) {
                        changedByDocument[docNum] = [];
                    }
                    
                    changedByDocument[docNum].push({
                        name: productName,
                        factQty: newQty,
                        invoiceQty: originalInvoiceQty,
                        isNew: row.isNew || false,
                        sentQty: row.qtn_sent,
                        deliveredQty: row.qtn_delivered
                    });
                }
            }
        });

        // Генерируем комментарии для каждого документа
        const commentsStage = document.getElementById('commentsStage');
        const commentsContainer = document.getElementById('commentsContainer') || commentsStage;
        commentsContainer.innerHTML = '';
        const commentsText = document.getElementById('commentsText');
        if (commentsText) commentsText.style.display = 'none';
        const btnCopyComments = document.getElementById('btnCopyComments');
        if (btnCopyComments) btnCopyComments.style.display = 'none';
        const copySuccess = document.getElementById('copySuccess');
        if (copySuccess) copySuccess.style.display = 'none';
        
        const sortedDocs = Object.keys(changedByDocument).sort();
        
        sortedDocs.forEach(docNum => {
            const items = changedByDocument[docNum];
            
            // Создаем контейнер для каждого документа
            const docBox = document.createElement('div');
            docBox.className = 'comment-box';
            docBox.style.marginBottom = '20px';
            docBox.style.padding = '15px';
            docBox.style.border = '1px solid #ddd';
            docBox.style.borderRadius = '5px';
            docBox.style.backgroundColor = '#f9f9f9';
            
            // Заголовок с номером документа
            const header = document.createElement('h3');
            header.textContent = `📋 Номер документа: ${docNum}`;
            header.style.marginTop = '0';
            header.style.marginBottom = '10px';
            header.style.color = '#333';
            docBox.appendChild(header);
            
            // Текстовое поле с расхождениями
            const textarea = document.createElement('textarea');
            textarea.className = 'comment-textarea';
            textarea.style.width = '100%';
            textarea.style.height = '120px';
            textarea.style.padding = '10px';
            textarea.style.fontFamily = 'monospace';
            textarea.style.fontSize = '14px';
            textarea.style.border = '1px solid #ccc';
            textarea.style.borderRadius = '3px';
            textarea.readOnly = true;
            
            // Генерируем текст: номер документа вверху, потом расхождения
            let text = `Номер документа: ${docNum}\n\n`;
            items.forEach(item => {
                // Выводим все расхождения без приписки
                let line = `${item.name} по факту ${item.factQty}, по накладной ${item.invoiceQty}.`;

                if (
                    this.isExordDeliveredMode &&
                    item.sentQty !== undefined && item.sentQty !== null &&
                    item.deliveredQty !== undefined && item.deliveredQty !== null
                ) {
                    const sent = Number(item.sentQty);
                    const delivered = Number(item.deliveredQty);
                    if (!Number.isNaN(sent) && !Number.isNaN(delivered)) {
                        const diff = sent - delivered;
                        const tr = input.closest('tr');
                        if (tr && tr.children.length >= 6) {
                            const invoiceQty = parseFloat(input.dataset.originalQty);
                            const invoiceVal = Number.isNaN(invoiceQty) ? 0 : invoiceQty;
                            const sentDiff = this.sentTotals[key] - invoiceVal;
                            tr.children[3].textContent = sentDiff;
                        }
                    }
                }

                text += `${line}\n`;
            });
            textarea.value = text.trim();
            docBox.appendChild(textarea);
            
            // Кнопка копирования для этого документа
            const copyBtn = document.createElement('button');
            copyBtn.textContent = '📋 Скопировать текст';
            copyBtn.style.marginTop = '10px';
            copyBtn.style.padding = '8px 15px';
            copyBtn.style.backgroundColor = '#007bff';
            copyBtn.style.color = 'white';
            copyBtn.style.border = 'none';
            copyBtn.style.borderRadius = '3px';
            copyBtn.style.cursor = 'pointer';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(textarea.value).then(() => {
                    const origText = copyBtn.textContent;
                    copyBtn.textContent = '✅ Скопировано!';
                    setTimeout(() => copyBtn.textContent = origText, 2000);
                });
            };
            docBox.appendChild(copyBtn);
            
            commentsContainer.appendChild(docBox);
        });

        document.getElementById('resultsTable').style.display = 'none';
        document.getElementById('commentsStage').style.display = 'block';
    }

    returnQuantities(payloads) {
        if (!payloads || payloads.length === 0) {
            payloads = this.lastPayloads;
        }
        
        if (!payloads || payloads.length === 0) {
            this.showStatus('❌ Нет данных для возврата', 'error');
            return;
        }
        
        // Удаляем кнопку возврата сразу после нажатия
        const btnReturn = document.getElementById('btnReturnQty');
        if (btnReturn) {
            btnReturn.remove();
        }
        
        // Создаем новый payload с отрицательными количествами
        const returnPayloads = payloads.map(item => ({
            ...item,
            qtn: -(item.qtn)  // Отправляем с минусом
        }));
        
        this.showStatus('⏳ Возврат товаров...', 'loading');
        
        console.log('\n' + '='.repeat(60));
        console.log('📤 ВОЗВРАТ ТОВАРОВ (отрицательные значения):');
        console.log('='.repeat(60));
        console.log('Первые 3 записи:', JSON.stringify(returnPayloads.slice(0, 3), null, 2));
        console.log(`Всего: ${returnPayloads.length} записей`);
        console.log('='.repeat(60) + '\n');
        
        fetch('/api/update-quantities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jwt_token: this.apiConfig.jwt,
                payloads: returnPayloads,
                document_numbers: this.documentNumbers || []
            })
        })
        .then(r => {
            return r.json().then(d => ({status: r.status, data: d}));
        })
        .then(({status, data}) => {
            if (data.success) {
                alert(`✅ Возвращено ${data.success_count || returnPayloads.length} товаров!`);
                this.showStatus('', 'success');
            } else {
                alert('❌ ' + data.error);
                this.showStatus('', 'error');
            }
        })
        .catch(e => {
            alert('❌ ' + e.message);
            this.showStatus('', 'error');
        });
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
            }
        }
        
        this.showStatus('✅ Все значения "По факту" обнулены', 'success');
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
                this.showStatus(`✅ УСПЕШНО! Обнулено ${totalItems} товаров на сервере!`, 'success');
            });
        })
        .catch(e => {            this.showStatus(`❌ ${e.message}`, 'error');
        })
        .finally(() => {
            if (btn) btn.disabled = false;
        });
    }

    // ========== МЕТОДЫ ДЛЯ ДОБАВЛЕНИЯ НОВЫХ ТОВАРОВ ==========

    showAddProductModal() {
        this.renderDocumentButtons();
        document.getElementById('addProductModal').classList.add('show');
        document.getElementById('productSearch').focus();
        this.selectedProduct = null;
        document.getElementById('selectedProductInfo').style.display = 'none';
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('productSearch').value = '';
    }

    getAvailableDocumentNumbers() {
        const numbers = new Set();

        if (Array.isArray(this.documentNumbers)) {
            this.documentNumbers.forEach(doc => {
                const value = String(doc || '').trim();
                if (value) numbers.add(value);
            });
        }

        if (this.currentRows && Array.isArray(this.currentRows)) {
            this.currentRows.forEach(row => {
                const value = String((row && row.document_number) || '').trim();
                if (value) numbers.add(value);
            });
        }

        return Array.from(numbers).sort((a, b) => a.localeCompare(b, 'ru'));
    }

    renderDocumentButtons() {
        const container = document.getElementById('newProductDocumentButtons');
        if (!container) return;

        const docs = this.getAvailableDocumentNumbers();

        // Сохраняем только актуальный выбранный документ
        if (!docs.includes(this.selectedDocument)) {
            this.selectedDocument = '';
        }

        // Автовыбор первого документа
        if (!this.selectedDocument && docs.length > 0) {
            this.selectedDocument = docs[0];
        }

        container.innerHTML = '';

        if (docs.length === 0) {
            container.innerHTML = '<div class="doc-buttons-empty">Нет доступных документов</div>';
            return;
        }

        docs.forEach(doc => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'doc-button';
            btn.textContent = doc;

            if (this.selectedDocument === doc) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', () => {
                this.selectedDocument = doc;
                this.renderDocumentButtons();
            });

            container.appendChild(btn);
        });
    }

    closeAddProductModal() {
        document.getElementById('addProductModal').classList.remove('show');
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('selectedProductInfo').style.display = 'none';
        this.selectedProduct = null;
    }

    searchProducts(query) {
        const searchDiv = document.getElementById('searchResults');
        
        if (!query || query.length < 2) {
            searchDiv.style.display = 'none';
            searchDiv.innerHTML = '';
            return;
        }

        // Отправляем запрос на поиск товаров (используется локальный data.json)
        fetch('/api/search-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                search_query: query
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.products && data.products.length > 0) {
                searchDiv.innerHTML = '';
                data.products.slice(0, 10).forEach(product => {
                    const sku = String((product && product.sku) || '');
                    const name = String((product && product.name) || '');

                    const itemDiv = document.createElement('div');
                    itemDiv.style.padding = '10px 12px';
                    itemDiv.style.borderBottom = '1px solid #eee';
                    itemDiv.style.cursor = 'pointer';

                    itemDiv.addEventListener('mouseover', () => {
                        itemDiv.style.background = '#f5f5f5';
                    });
                    itemDiv.addEventListener('mouseout', () => {
                        itemDiv.style.background = 'white';
                    });
                    itemDiv.addEventListener('click', () => {
                        this.selectProduct(sku, name);
                    });

                    const nameDiv = document.createElement('div');
                    nameDiv.style.fontWeight = '500';
                    nameDiv.style.fontSize = '13px';
                    nameDiv.style.color = '#333';
                    nameDiv.textContent = name;

                    const skuDiv = document.createElement('div');
                    skuDiv.style.fontSize = '12px';
                    skuDiv.style.color = '#999';
                    skuDiv.style.marginTop = '3px';
                    skuDiv.textContent = `SKU: ${sku}`;

                    itemDiv.appendChild(nameDiv);
                    itemDiv.appendChild(skuDiv);
                    searchDiv.appendChild(itemDiv);
                });
                searchDiv.style.display = 'block';
            } else {
                searchDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #999;">Товары не найдены</div>';
                searchDiv.style.display = 'block';
            }
        })
        .catch(e => {
            console.error('❌ Ошибка поиска:', e);
            searchDiv.innerHTML = '<div style="padding: 15px; text-align: center; color: #e74c3c;">Ошибка поиска</div>';
            searchDiv.style.display = 'block';
        });
    }

    selectProduct(sku, name) {
        this.selectedProduct = { sku, name };
        document.getElementById('productSearch').value = name;
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('selectedProductInfo').style.display = 'block';
        document.getElementById('selectedProductName').textContent = name;
        document.getElementById('selectedProductSku').textContent = `SKU: ${sku}`;
    }

    addProductToTable() {
        if (!this.selectedProduct) {
            alert('❌ Выберите товар из списка поиска');
            return;
        }

        const selectedDoc = String(this.selectedDocument || '').trim();
        if (!selectedDoc) {
            alert('❌ Выберите документ');
            return;
        }

        const newProduct = {
            sku: this.selectedProduct.sku,
            name: this.selectedProduct.name,
            api_qtn: 0,
            invoice_qty: 0,  // Всегда 0 для новых товаров
            fact_qty: 0,
            isNew: true,
            document_number: selectedDoc
        };
        this.newProducts.push(newProduct);

        console.log(`✅ Добавлен новый товар: ${this.selectedProduct.name} (${this.selectedProduct.sku}), документ: ${selectedDoc}`);
        this.showStatus(`✅ Товар "${this.selectedProduct.name}" добавлен в документ ${selectedDoc}!`, 'success');

        // Закрываем модальное окно
        this.closeAddProductModal();

        // Перерисовываем таблицу с новым товаром
        if (this.currentRows) {
            this.displayTable(this.currentRows.filter(r => !r.isNew));
        }
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
        const btnComments = document.getElementById('btnCommentsOnly');
        if (btnComments) btnComments.style.display = 'none';
        const btnAdd = document.getElementById('btnAddProduct');
        if (btnAdd) btnAdd.style.display = 'none';
        document.getElementById('commentsStage').style.display = 'none';
        this.newProducts = []; // Очищаем новые товары
        this.apiConfig = null;
        this.currentRows = null;
        localStorage.removeItem('accountLogin'); // Очищаем сохраненный логин для новой аутентификации
    }

    log(msg, type = 'info') {
        console.log(`[${type.toUpperCase()}]`, msg);
    }
}

// Глобальная переменная для доступа из onclick атрибутов
let stage2Manager;

document.addEventListener('DOMContentLoaded', () => {
    stage2Manager = new Stage2Manager();
    
    // Добавляем слушатель поиска товаров
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(stage2Manager.searchTimeout);
            // Задержка 300ms чтобы не делать запрос на каждый символ
            stage2Manager.searchTimeout = setTimeout(() => {
                stage2Manager.searchProducts(e.target.value);
            }, 300);
        });
        
        // Закрываем список при фокусе потери
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                document.getElementById('searchResults').style.display = 'none';
            }, 200);
        });
        
        // Открываем список при фокусе если есть текст
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                stage2Manager.searchProducts(searchInput.value);
            }
        });
    }
});
