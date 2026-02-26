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
        // Если transformedData отсутствует в localStorage, попытаться получить его с сервера (сессия)
        if (!localStorage.getItem('transformedData')) {
            console.log('ℹ️ transformedData не найдено в localStorage — запрашиваю с сервера /api/get-session-data');
            fetch(`/api/get-session-data?session_id=${this.sessionId}`)
                .then(r => r.json())
                .then(d => {
                    if (d && d.transformed_data) {
                        try {
                            localStorage.setItem('transformedData', JSON.stringify(d.transformed_data));
                            if (d.document_numbers) {
                                localStorage.setItem('documentNumbers', JSON.stringify(d.document_numbers));
                                this.documentNumbers = d.document_numbers;
                            }
                            console.log('✅ transformedData сохранено в localStorage из сессии');
                        } catch (e) {
                            console.warn('⚠️ Не удалось сохранить transformed_data из сессии в localStorage:', e);
                        }
                    }
                })
                .catch(e => console.warn('⚠️ Ошибка запроса /api/get-session-data:', e));
        }
        this.newProducts = []; // Массив для хранения добавленных вручную товаров
        this.selectedProduct = null; // Выбранный товар для добавления
        this.selectedDocument = ''; // Выбранный документ в модальном окне
        this.searchTimeout = null; // Таймаут для поиска
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

    loadInvoiceData() {
        const invoiceDataStr = localStorage.getItem('invoiceData');
        const invoiceDeliveredStr = localStorage.getItem('invoiceDeliveredData');
        const invoiceNamesStr = localStorage.getItem('invoiceNames');
        const documentNumbersStr = localStorage.getItem('documentNumbers');
        const exordModeStr = localStorage.getItem('exordMode');
        const exordColumnStr = localStorage.getItem('exordColumn');
        
        if (invoiceDataStr) {
            this.invoiceData = JSON.parse(invoiceDataStr);
        } else {
            this.invoiceData = {};
        }

        // Если есть сохранённая карта доставленных количеств — сохраняем её отдельно
        this.invoiceDeliveredData = {};
        if (invoiceDeliveredStr) {
            try {
                const invDel = JSON.parse(invoiceDeliveredStr);
                if (invDel && Object.keys(invDel).length > 0) {
                    this.invoiceDeliveredData = invDel;
                    console.log('ℹ️ Загружена invoiceDeliveredData (карта доставленных количеств)');
                }
            } catch (e) {
                console.warn('⚠️ Не удалось распарсить invoiceDeliveredData:', e);
            }
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
        // branchTarget set in Stage1: 'radix' or 'together'
        const branchTargetStr = localStorage.getItem('branchTarget') || 'together';
        this.branchTarget = branchTargetStr;
        
        if (this.documentNumbers && this.documentNumbers.length > 0) {
            console.log(`📋 Номера документов загружены: ${this.documentNumbers.join(', ')}`);
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
        // Telegram notifications are enabled

        const login = this.getAccountLogin();
        const docs = this.getDocumentNumbers();

        // Build per-document counts: total items and changed items
        const docTotals = {};
        const docChanged = {};
        if (Array.isArray(this.currentRows)) {
            this.currentRows.forEach((row, idx) => {
                const doc = row.document_number || 'Без документа';
                docTotals[doc] = (docTotals[doc] || 0) + 1;
                // determine if changed or new
                const input = document.getElementById(`qty_${idx}`);
                let isChanged = false;
                if (input) {
                    const newQty = parseFloat(input.value) || 0;
                    const original = parseFloat(input.dataset.originalQty) || 0;
                    if (row.isNew || newQty !== original) isChanged = true;
                } else {
                    // fallback: consider new products as changed
                    if (row.isNew) isChanged = true;
                }
                if (isChanged) docChanged[doc] = (docChanged[doc] || 0) + 1;
            });
        }

        const branchStored = localStorage.getItem('branchTarget') || 'together';
        const branchLabel = branchStored === 'radix' ? 'По отдельности' : 'Разом';

        const payload = {
            action: action,
            account_login: login,
            document_numbers: docs,
            document_counts: { totals: docTotals, changed: docChanged },
            branch: branchLabel,
            clicked_at: new Date().toLocaleString('ru-RU')
        };

        console.log('📤 Telegram отправка:', { login, docs, action });

        fetch('/api/notify-telegram', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => {
            if (!r.ok) {
                return r.text().then(text => {
                    console.warn(`⚠️ Telegram: HTTP ${r.status} - ${text}`);
                });
            }
            return r.json().then(data => {
                if (!data.success) {
                    console.warn(`⚠️ Telegram: ${data.error || 'не удалось отправить уведомление'}`);
                } else {
                    console.log(`✅ Telegram отправлен: логин="${login}", действие="${action}"`);
                }
            });
        })
        .catch(e => {
            console.warn(`⚠️ Telegram: ${e.message}`);
        });
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
        console.log('🔵 authenticate() вызвана в Stage2Manager');
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
                
                // (missing_items removed) Фронтенд будет работать только с присланными `rows`
                
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
        
        // Добавляем отсутствующие на сервере позиции из invoiceData (они есть в накладной)
        const missingRows = [];
        try {
            const invoiceSkus = this.invoiceData ? Object.keys(this.invoiceData) : [];
            const existingSkus = new Set(rows.map(r => r.sku));
            const newSkus = new Set(this.newProducts.map(p => p.sku));
            invoiceSkus.forEach(sku => {
                if (!existingSkus.has(sku) && !newSkus.has(sku)) {
                    const invoiceQty = this.invoiceData[sku];
                    const nameFromInvoice = (this.invoiceNames && this.invoiceNames[sku]) || sku;
                    const docNum = documentMapping[sku] || '';
                    missingRows.push({
                        sku: sku,
                        name: nameFromInvoice,
                        api_qtn: undefined, // will render as '-'
                        invoice_qty: invoiceQty,
                        isNew: false,
                        isMissing: true,
                        document_number: docNum
                    });
                }
            });
        } catch (e) {
            console.warn('Не удалось сформировать missingRows:', e);
        }

        // Объединяем товары API, отсутствующие позиции из накладной и новые вручную добавленные товары
        const allRows = [...rows, ...missingRows, ...this.newProducts];
        this.currentRows = allRows; // Сохраняем all rows для отправки

        console.log(`\n=== НАЧАЛО displayTable() ===`);
        console.log(`📊 Товаров с API: ${rows.length}, Новых товаров: ${this.newProducts.length}`);
        
        allRows.forEach((row, idx) => {
            const tr = document.createElement('tr');
            // no-server rows removed — only server/new rows are displayed
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
                    inputValue = invoiceQty;
                }
            }

            // In Exord (Разом) mode prefer delivered quantities for prefill, but do not remove SKUs without delivered amounts.
            // Priority for prefilling 'delivered' value:
            // 1) row.qtn_delivered (comes from transformedData mapping by document)
            // 2) this.invoiceDeliveredData[row.sku] (saved from Stage1 if present)
            if (this.exordMode && !row.isNew) {
                if (row.qtn_delivered !== undefined && row.qtn_delivered !== null && row.qtn_delivered !== '') {
                    const prev = inputValue;
                    inputValue = row.qtn_delivered;
                    console.log(`ℹ️ [Exord override] SKU=${row.sku} doc=${row.document_number || ''} prev=${prev} -> delivered(from transformed)=${inputValue}`);
                } else if (this.invoiceDeliveredData && this.invoiceDeliveredData[row.sku] !== undefined) {
                    const prev = inputValue;
                    inputValue = this.invoiceDeliveredData[row.sku];
                    console.log(`ℹ️ [Exord override] SKU=${row.sku} doc=${row.document_number || ''} prev=${prev} -> delivered(from invoiceDeliveredData)=${inputValue}`);
                }
            }
            input.value = inputValue;
            input.dataset.originalQty = invoiceQty; // Сохраняем исходное значение
            input.dataset.serverQty = row.api_qtn || row.invoice_qty || 0;
            input.dataset.sentQty = row.qtn_sent ?? '';
            input.dataset.deliveredQty = row.qtn_delivered ?? '';
            input.dataset.isExordSentMode = this.isExordSentMode ? '1' : '0';
            input.addEventListener('input', () => this.updateFactInputHighlight(input));
            
            // Вычисляем "По накладной" / отображение в колонке "Отправлено":
            // В режиме Экзорд (Разом) показываем значение из заголовка "Отправлено" (`qtn_sent`),
            // если оно есть; иначе используем значение из накладной.
            let invoiceQtyDisplay = invoiceQty !== undefined ? invoiceQty : '?';
            if (this.exordMode && row.qtn_sent !== undefined && row.qtn_sent !== null && row.qtn_sent !== '') {
                invoiceQtyDisplay = row.qtn_sent;
            }
            
            // Значение "На сервере" - это значение api_qtn из GET запроса (для отсутствующих — '-')
            const serverQtyDisplay = (row.api_qtn !== undefined) ? row.api_qtn : '-';
            
            // Подсвечиваем новые и отсутствующие на сервере товары
            let rowStyle = '';
            let badge = '';
            if (row.isNew) {
                rowStyle = 'background-color: #fff8dc; font-weight: 500;';
                badge = ' <span style="color: #f39c12; font-weight: bold;">[НОВЫЙ]</span>';
            } else if (row.isMissing) {
                rowStyle = 'background-color: #fff8c4; font-weight: 500;';
                badge = ' <span style="color: #b08900; font-weight: bold;">[ОТСУТСТВУЕТ]</span>';
            }
            
            const tr_html = `
                <td style="${rowStyle}">${idx + 1}</td>
                <td style="${rowStyle}">${row.sku}</td>
                <td style="${rowStyle}">${row.name}${badge}</td>
                <td style="${rowStyle}">${serverQtyDisplay}</td>
                <td style="${rowStyle}">${invoiceQtyDisplay}</td>
                <td class="edit-column" style="${rowStyle}"></td>
            `;
            tr.innerHTML = tr_html;
            tr.querySelector('.edit-column').appendChild(input);
            tbody.appendChild(tr);
            this.updateFactInputHighlight(input);
        });
        // Если режим "По отдельности" (radix) и есть отсутствующие позиции, деактивируем кнопку отправки
        try {
            const hasMissing = allRows.some(r => r.isMissing);
            const sendBtn = document.getElementById('btnSendQty');
            if (this.branchTarget === 'radix' && hasMissing) {
                if (sendBtn) {
                    sendBtn.disabled = true;
                    sendBtn.style.background = '#c0c0c0';
                    sendBtn.style.color = '#666';
                    sendBtn.title = 'Есть отсутствующие позиции — отправка недоступна в режиме "По отдельности"';
                }
            } else {
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.removeAttribute('style');
                    sendBtn.title = '';
                }
            }
        } catch (e) {
            console.warn('Ошибка при установке состояния кнопки отправки:', e);
        }
        
        console.log(`=== КОНЕЦ displayTable() - отображено ${allRows.length} строк ===\n`);
        
        document.getElementById('resultsTable').style.display = 'block';
        document.getElementById('btnSendQty').style.display = 'inline-block';
        document.getElementById('btnCommentsOnly').style.display = 'inline-block';
        document.getElementById('btnResetZero').style.display = 'inline-block';
        document.getElementById('btnFillFromPrev').style.display = 'inline-block';
        document.getElementById('btnAddProduct').style.display = 'inline-block';
    }

    updateFactInputHighlight(input) {
        if (!input) return;

        const row = input.closest('tr');
        if (!row) return;

        // Берём значение из ячейки перед input (колонка "Отправлено")
        const editCell = input.closest('td');
        const prevCell = editCell ? editCell.previousElementSibling : null;
        const prevValue = prevCell ? parseFloat(prevCell.textContent.trim().replace(',', '.')) : NaN;
        const inputValue = parseFloat(String(input.value).replace(',', '.'));

        // Подсвечиваем если последние два числа отличаются
        const differs = !Number.isNaN(prevValue) && !Number.isNaN(inputValue) && prevValue !== inputValue;

        if (differs) {
            row.classList.add('row-warning');
            row.style.backgroundColor = '#ff000078';
        } else {
            row.classList.remove('row-warning');
            row.style.backgroundColor = '';
        }
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

        // Если в режиме "По отдельности" есть отсутствующие позиции — запрещаем отправку
        if (this.branchTarget === 'radix' && this.currentRows.some(r => r.isMissing)) {
            this.showStatus('❌ Есть отсутствующие позиции — отправка недоступна в режиме "По отдельности"', 'error');
            alert('Есть отсутствующие позиции — в режиме "По отдельности" сначала удалите или добавьте отсутствующие позиции.');
            return;
        }

        // Собираем payload из значений input (передаём значение по накладной)
        const payloads = [];
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const invoiceQty = parseFloat(input.value) || 0; // Поддерживает дробные числа (2.5, 3.75 и т.д.)
                payloads.push({
                    "productId": row.productId || '',  // может отсутствовать для новых товаров
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
                
                // Отправляем уведомление в Telegram
                this.notifyTelegram('send_all');
                
                // Логируем изменения в историю
                this.logChanges(payloads);

                // Сохраняем payloads для использования в returnQuantities
                this.lastPayloads = payloads;

                // Показываем кнопки для перехода к комментариям и возврата товаров
                let btnGroup = document.querySelector('#resultsTable .button-group');
                if (!btnGroup) {
                    const sendBtn = document.getElementById('btnSendQty');
                    if (sendBtn) btnGroup = sendBtn.closest('.button-group');
                }
                if (!btnGroup) {
                    const results = document.getElementById('resultsTable');
                    if (results && results.nextElementSibling && results.nextElementSibling.classList.contains('button-group')) {
                        btnGroup = results.nextElementSibling;
                    }
                }
                if (btnGroup) {
                    let btnComments = document.getElementById('btnComments');
                    if (!btnComments) {
                        btnComments = document.createElement('button');
                        btnComments.id = 'btnComments';
                        btnComments.textContent = '📝 Перейти к комментариям';
                        btnComments.style.marginLeft = '10px';
                        btnComments.onclick = () => {
                            this.generateComments();
                            this.notifyTelegram('comments_only');
                        };
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
        this.generateComments();
        this.notifyTelegram('comments_only');
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
                    
                    const docNum = row.document_number || 'Без документа';
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

        // ===== DEBUG: Все доступные данные при генерации комментариев =====
        console._log('\n' + '='.repeat(80));
        console._log('📝 generateComments() — ВСЕ ДОСТУПНЫЕ ДАННЫЕ (stage2)');
        console._log('='.repeat(80));

        // 1. Глобальные настройки
        console._log('\n🔧 НАСТРОЙКИ:');
        console._log('   sessionId:', this.sessionId);
        console._log('   exordMode:', this.exordMode);
        console._log('   exordColumn:', this.exordColumn);
        console._log('   isExordDeliveredMode:', this.isExordDeliveredMode);
        console._log('   isExordSentMode:', this.isExordSentMode);

        // 2. Номера документов
        console._log('\n📋 НОМЕРА ДОКУМЕНТОВ:', this.documentNumbers);

        // 3. Данные накладной (Stage 1)
        console._log('\n📦 INVOICE DATA (SKU → кол-во из накладной):');
        console._log('   Всего SKU:', Object.keys(this.invoiceData || {}).length);
        console._log('   Данные:', JSON.parse(JSON.stringify(this.invoiceData || {})));

        // 4. Названия из накладной
        console._log('\n🏷️ INVOICE NAMES (SKU → название):');
        console._log('   Всего:', Object.keys(this.invoiceNames || {}).length);
        console._log('   Данные:', JSON.parse(JSON.stringify(this.invoiceNames || {})));

        // 5. Новые (вручную добавленные) товары
        console._log('\n➕ НОВЫЕ ТОВАРЫ (добавлены вручную):', this.newProducts);

        // 6. Полная таблица currentRows
        console._log('\n📊 CURRENT ROWS (все строки таблицы):');
        console._log('   Всего строк:', this.currentRows.length);
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            const inputValue = input ? input.value : 'N/A';
            const originalQty = input ? input.dataset.originalQty : 'N/A';
            console._log(`   [${idx}] SKU: ${row.sku} | Название: ${row.name} | На сервере (api_qtn): ${row.api_qtn} | По накладной (our_qtn): ${row.our_qtn} | Итого (total_qtn): ${row.total_qtn} | Отправлено: ${row.qtn_sent} | Доставлено: ${row.qtn_delivered} | Документ: ${row.document_number || '-'} | productId: ${row.productId || '-'} | input.value: ${inputValue} | originalQty: ${originalQty} | isNew: ${row.isNew || false} | isMissing: ${row.isMissing || false}`);
        });

        // 7. Доставленные данные из localStorage
        try {
            const deliveredStr = localStorage.getItem('invoiceDeliveredData');
            if (deliveredStr) {
                console._log('\n🚚 INVOICE DELIVERED DATA (из localStorage):', JSON.parse(deliveredStr));
            }
        } catch(e) {}

        // 8. transformedData из localStorage
        try {
            const tdStr = localStorage.getItem('transformedData');
            if (tdStr) {
                const td = JSON.parse(tdStr);
                console._log('\n📄 TRANSFORMED DATA (из localStorage):');
                console._log('   Всего записей:', td.length);
                td.forEach((item, i) => {
                    console._log(`   [${i}] SKU: ${item.sku} | Название: ${item.name} | qtn_invoice: ${item.qtn_invoice} | qtn_fact: ${item.qtn_fact} | qtn_sent: ${item.qtn_sent} | qtn_delivered: ${item.qtn_delivered} | document_number: ${item.document_number || '-'}`);
                });
            }
        } catch(e) {}

        console._log('\n' + '='.repeat(80) + '\n');
        // ===== КОНЕЦ DEBUG =====

        // Собираем измененные товары, группированные по документам
        const changedByDocument = {}; // { "11813": [...], "11814": [...] }
        const commentedIndices = new Set();
        
        this.currentRows.forEach((row, idx) => {
            const input = document.getElementById(`qty_${idx}`);
            if (input) {
                const newQty = (function(v){
                    if (v === null || v === undefined) return 0;
                    if (typeof v === 'string') {
                        if (v.trim() === '' || v.trim() === '-' || v.toLowerCase() === 'нету') return 0;
                        const p = parseFloat(v.replace(',', '.'));
                        return Number.isNaN(p) ? 0 : p;
                    }
                    const n = Number(v);
                    return Number.isNaN(n) ? 0 : n;
                })(input.value);

                // "По накладной" — берём из ячейки перед input (то, что видит пользователь), иначе row.qtn_sent / row.qtn_invoice
                const originalInvoiceQty = (function(){
                    // 1) Значение из ячейки перед input (td перед .edit-column)
                    const editCell = input.closest('td');
                    if (editCell && editCell.previousElementSibling) {
                        const cellText = editCell.previousElementSibling.textContent.trim();
                        const parsed = parseFloat(cellText.replace(',', '.'));
                        if (!Number.isNaN(parsed)) return parsed;
                    }
                    // 2) qtn_sent (отправлено из трансформации)
                    if (row.qtn_sent !== undefined && row.qtn_sent !== null && row.qtn_sent !== '') {
                        const p = parseFloat(String(row.qtn_sent).replace(',', '.'));
                        if (!Number.isNaN(p)) return p;
                    }
                    // 3) qtn_invoice (из трансформированных данных)
                    if (row.qtn_invoice !== undefined && row.qtn_invoice !== null) {
                        const p = parseFloat(String(row.qtn_invoice).replace(',', '.'));
                        if (!Number.isNaN(p)) return p;
                    }
                    // 4) Fallback: dataset.originalQty
                    const p = parseFloat(input.dataset.originalQty);
                    return Number.isNaN(p) ? 0 : p;
                })();

                // Строка попадает в комментарии если у неё класс row-warning (последние два числа отличаются) или это новый товар
                const tr = input.closest('tr');
                const hasWarning = tr && tr.classList.contains('row-warning');
                
                if (hasWarning || row.isNew) {
                    let productName = row.name;
                    if (this.invoiceNames && this.invoiceNames[row.sku]) {
                        productName = this.invoiceNames[row.sku];
                    }
                    
                    const docNum = row.document_number || 'Без документа';
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
                    // mark this row index for highlighting
                    commentedIndices.add(idx);
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
                    // Выводим все расхождения
                    const line = `${item.name} по факту ${item.factQty}, по накладной ${item.invoiceQty}.`;

                if (
                    this.isExordDeliveredMode &&
                    item.sentQty !== undefined && item.sentQty !== null &&
                    item.deliveredQty !== undefined && item.deliveredQty !== null
                ) {
                    const sent = Number(item.sentQty);
                    const delivered = Number(item.deliveredQty);
                    if (!Number.isNaN(sent) && !Number.isNaN(delivered)) {
                        const diff = sent - delivered;
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

        // hide main button group and status area on comments page
        const results = document.getElementById('resultsTable');
        const mainBtnGroup = (results && results.nextElementSibling && results.nextElementSibling.classList.contains('button-group'))
            ? results.nextElementSibling
            : document.querySelector('#resultsTable .button-group');
        if (mainBtnGroup) mainBtnGroup.style.display = 'none';
        const statusDiv = document.getElementById('statusMessage');
        if (statusDiv) statusDiv.style.display = 'none';

        // highlight all rows involved in comments
        commentedIndices.forEach(i => {
            const inputEl = document.getElementById(`qty_${i}`);
            if (!inputEl) return;
            const tr = inputEl.closest('tr');
            if (tr) {
                tr.classList.add('row-warning');
                tr.style.backgroundColor = '#ff000078';
            }
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
        // restore main button group and status area
        const results = document.getElementById('resultsTable');
        const mainBtnGroup = (results && results.nextElementSibling && results.nextElementSibling.classList.contains('button-group'))
            ? results.nextElementSibling
            : document.querySelector('#resultsTable .button-group');
        if (mainBtnGroup) mainBtnGroup.style.display = '';
        const statusDiv = document.getElementById('statusMessage');
        if (statusDiv) statusDiv.style.display = '';

        document.getElementById('resultsTable').style.display = 'block';

        // Пересчитываем подсветку row-warning для всех строк
        if (this.currentRows) {
            this.currentRows.forEach((_, idx) => {
                const input = document.getElementById(`qty_${idx}`);
                if (input) this.updateFactInputHighlight(input);
            });
        }
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
                // Обновляем подсветку строки при программном изменении
                try {
                    this.updateFactInputHighlight(input);
                } catch (e) {
                    // fallback: триггерим событие input
                    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
                }
            }
        }
        
        this.showStatus('✅ Все значения "По факту" обнулены', 'success');
    }

    fillFromPrevColumn() {
        if (!this.currentRows || this.currentRows.length === 0) {
            this.showStatus('❌ Нет данных для заполнения', 'error');
            return;
        }

        let filled = 0;
        for (let i = 0; i < this.currentRows.length; i++) {
            const input = document.getElementById(`qty_${i}`);
            if (!input) continue;

            const editCell = input.closest('td');
            const prevCell = editCell ? editCell.previousElementSibling : null;
            if (prevCell) {
                const cellText = prevCell.textContent.trim();
                const parsed = parseFloat(cellText.replace(',', '.'));
                if (!Number.isNaN(parsed)) {
                    input.value = parsed;
                    filled++;
                }
            }
            this.updateFactInputHighlight(input);
        }

        this.showStatus(`✅ Заполнено ${filled} из ${this.currentRows.length} полей`, 'success');
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
        const qtyEl = document.getElementById('newProductQty');
        if (qtyEl) qtyEl.value = '1';
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
            // Показываем явную опцию "Без документа" чтобы пользователь мог добавить позицию без номера документа
            const noDocBtn = document.createElement('button');
            noDocBtn.type = 'button';
            noDocBtn.className = 'doc-button';
            noDocBtn.textContent = 'Без документа';
            if (this.selectedDocument === '') {
                noDocBtn.classList.add('active');
            }
            noDocBtn.addEventListener('click', () => {
                this.selectedDocument = '';
                this.renderDocumentButtons();
            });
            container.appendChild(noDocBtn);
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

    // renderMissingItems removed

    closeAddProductModal() {
        document.getElementById('addProductModal').classList.remove('show');
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('selectedProductInfo').style.display = 'none';
        this.selectedProduct = null;
        const qtyEl = document.getElementById('newProductQty');
        if (qtyEl) qtyEl.value = '';
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
        const docsAvailable = (this.getAvailableDocumentNumbers && this.getAvailableDocumentNumbers().length > 0);
        if (!selectedDoc && docsAvailable) {
            alert('❌ Выберите документ');
            return;
        }

        // Получаем и валидируем количество из модального окна
        const qtyEl = document.getElementById('newProductQty');
        let qty = 0;
        if (qtyEl) {
            qty = parseFloat(qtyEl.value);
            if (Number.isNaN(qty) || qty < 0) {
                alert('❌ Укажите корректное количество (>= 0)');
                return;
            }
        }

        const newProduct = {
            sku: this.selectedProduct.sku,
            name: this.selectedProduct.name,
            api_qtn: 0,
            invoice_qty: 0,  // Всегда 0 для новых товаров
            fact_qty: qty,
            isNew: true,
            document_number: selectedDoc || ''
        };
        this.newProducts.push(newProduct);

        const displayDoc = selectedDoc || 'Без документа';
        console.log(`✅ Добавлен новый товар: ${this.selectedProduct.name} (${this.selectedProduct.sku}), документ: ${displayDoc}`);
        this.showStatus(`✅ Товар "${this.selectedProduct.name}" добавлен в документ ${displayDoc}!`, 'success');

        // Закрываем модальное окно
        this.closeAddProductModal();

        // Перерисовываем таблицу с новым товаром
        const baseRows = this.currentRows ? this.currentRows.filter(r => !r.isNew) : [];
        this.displayTable(baseRows);
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
        document.getElementById('btnCommentsOnly').style.display = 'none';
        document.getElementById('btnResetZero').style.display = 'none';
        document.getElementById('btnFillFromPrev').style.display = 'none';
        document.getElementById('btnAddProduct').style.display = 'none';
        document.getElementById('commentsStage').style.display = 'none';
        this.newProducts = []; // Очищаем новые товары
        this.apiConfig = null;
        this.currentRows = null;
        localStorage.removeItem('accountLogin'); // Очищаем сохраненный логин для новой аутентификации
    }

    // Debug helper: принудительно отобразить все SKU из invoiceData (включая отсутствующие)
    forceShowAllInvoiceSkus() {
        try {
            console.log('ℹ️ forceShowAllInvoiceSkus: принудительное отображение всех SKU из invoiceData');
            // displayTable expects server rows; passing empty array makes it build missingRows from invoiceData
            this.displayTable([]);
        } catch (e) {
            console.warn('⚠️ forceShowAllInvoiceSkus error:', e);
        }
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
