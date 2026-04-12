class InventoryManager {
    constructor() {
        this.sessionId = this.getOrCreateSessionId();
        this.apiConfig = null;
        this.allProducts = []; // Все товары из API
        this.inventoryItems = []; // Товары добавленные в инвентаризацию
        this.sentItems = []; // Товары после отправки
        this.submittedComment = ''; // Сохраненный комментарий
        this.currentPhase = 'edit'; // 'edit' или 'comments'
        this.selectedProduct = null; // Выбранный товар для добавления
        this.searchTimeout = null;
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
        this.loadJWTToken();
        this.loadSavedUsername();
        this.showStatus('✅ Режим инвентаризации готов', 'success');
    }

    loadJWTToken() {
        const jwtToken = localStorage.getItem('jwtToken');
        if (jwtToken) {
            this.apiConfig = { jwt: jwtToken };
            this.loadProducts();
        } else {
            this.showStatus('❌ JWT токен не найден. Авторизируйтесь на этапе 1', 'error');
        }
    }

    loadSavedUsername() {
        const username = localStorage.getItem('username');
        if (username) {
            console.log(`✅ Пользователь: ${username}`);
        }
    }

    loadProducts() {
        if (!this.apiConfig || !this.apiConfig.jwt) {
            this.showStatus('❌ JWT токен отсутствует', 'error');
            return;
        }

        this.showStatus('⏳ Загрузка товаров с сервера...', 'loading');

        fetch('/api/search-products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: this.sessionId,
                jwt_token: this.apiConfig.jwt,
                query: '' // Пустой запрос = все товары
            })
        })
            .then(r => r.json())
            .then(data => {
                if (data.success && data.products) {
                    // Конвертируем данные в нужный формат
                    this.allProducts = data.products.map(product => ({
                        sku: product.sku || product.SKU || '',
                        productId: product.id || product.productId || '',
                        name: product.nameRu || product.name || '',
                        api_qtn: parseFloat(product.qtn || 0),
                        category: product.category || ''
                    }));
                    console.log(`✅ Загружено товаров: ${this.allProducts.length}`);
                    this.showStatus('✅ Товары загружены', 'success');
                    this.showTableSection();
                } else {
                    this.showStatus(`❌ Ошибка при загрузке товаров: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(e => {
                this.showStatus(`❌ Ошибка загрузки: ${e.message}`, 'error');
                console.error('Ошибка загрузки товаров:', e);
            });
    }

    showTableSection() {
        const table = document.getElementById('inventTable');
        if (table) {
            table.style.display = 'block';
        }
    }

    showAddProductModal() {
        const modal = document.getElementById('addProductModal');
        const searchInput = document.getElementById('searchInput');
        if (modal) {
            modal.classList.add('active');
            searchInput.focus();
            searchInput.value = '';
            document.getElementById('productSearchResults').innerHTML = '';
            document.getElementById('productSearchResults').style.display = 'none';
        }
    }

    closeAddProductModal() {
        const modal = document.getElementById('addProductModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    searchProducts() {
        const query = document.getElementById('searchInput').value.trim().toLowerCase();
        
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (!query) {
            document.getElementById('productSearchResults').style.display = 'none';
            return;
        }

        this.searchTimeout = setTimeout(() => {
            const results = this.allProducts.filter(p => {
                const sku = (p.sku || '').toLowerCase();
                const name = (p.name || p.nameRu || '').toLowerCase();
                return sku.includes(query) || name.includes(query);
            }).slice(0, 20);

            const resultsDiv = document.getElementById('productSearchResults');
            if (results.length > 0) {
                resultsDiv.innerHTML = results.map((product, idx) => {
                    const displayName = product.name || product.nameRu || '';
                    const safeName = displayName.replace(/'/g, "\\'");
                    return `
                    <div style="padding: 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; hover: background: var(--light-color)" 
                         onclick="inventManager.selectProduct({sku: '${product.sku}', productId: '${product.productId}', nameRu: '${safeName}', api_qtn: ${product.api_qtn || 0}})">
                        <strong>${product.sku}</strong> - ${displayName}
                        <div style="font-size: 12px; color: var(--gray-color)">На сервере: ${product.api_qtn || 0}</div>
                    </div>
                `;
                }).join('');
                resultsDiv.style.display = 'block';
            } else {
                resultsDiv.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--gray-color)">Товар не найден</div>';
                resultsDiv.style.display = 'block';
            }
        }, 300);
    }

    selectProduct(product) {
        // Показываем форму выбранного товара и поле для кол-ва
        this.selectedProduct = product;
        document.getElementById('selectedProductName').textContent = product.nameRu || product.name || '';
        document.getElementById('selectedProductSku').textContent = product.sku;
        document.getElementById('selectedProductQty').textContent = product.api_qtn || 0;
        document.getElementById('addProductQty').value = 1;
        document.getElementById('selectedProductInfo').style.display = 'block';
        document.getElementById('btnAddToTable').style.display = 'inline-block';
        document.getElementById('productSearchResults').style.display = 'none';
    }

    addSelectedProduct() {
        if (!this.selectedProduct) {
            this.showStatus('⚠️ Товар не выбран', 'warning');
            return;
        }

        const qty = parseFloat(document.getElementById('addProductQty').value) || 0;

        // Проверяем нет ли уже такого товара
        if (this.inventoryItems.some(item => item.sku === this.selectedProduct.sku)) {
            this.showStatus('⚠️ Этот товар уже добавлен', 'warning');
            return;
        }

        this.inventoryItems.push({
            sku: this.selectedProduct.sku,
            productId: this.selectedProduct.productId || '',
            name: this.selectedProduct.nameRu || this.selectedProduct.name || '',
            api_qtn: this.selectedProduct.api_qtn || 0,
            fact_qty: qty,
            document_number: ''
        });

        this.closeAddProductModal();
        this.renderTable();
        this.showStatus(`✅ Товар "${this.selectedProduct.nameRu || this.selectedProduct.name}" добавлен (кол-во: ${qty})`, 'success');
    }

    renderTable() {
        const tbody = document.getElementById('inventTableBody');
        const addProductRow = document.getElementById('addProductRow');
        
        tbody.innerHTML = '';

        this.inventoryItems.forEach((item, idx) => {
            const tr = document.createElement('tr');
            
            const inputId = `qty_${idx}`;
            const input = document.createElement('input');
            input.type = 'number';
            input.id = inputId;
            input.min = 0;
            input.step = 0.1;
            input.className = 'qty-input';
            input.value = item.fact_qty || 0;
            input.dataset.originalQty = item.fact_qty || 0;
            input.addEventListener('change', () => {
                item.fact_qty = parseFloat(input.value) || 0;
            });

            // Создаем кнопки плюс/минус
            const qtyControls = document.createElement('div');
            qtyControls.className = 'qty-controls';
            
            const btnMinus = document.createElement('button');
            btnMinus.type = 'button';
            btnMinus.className = 'qty-btn qty-btn-minus';
            btnMinus.textContent = '−';
            btnMinus.style.margin = '0';
            btnMinus.addEventListener('click', (e) => {
                e.preventDefault();
                const currentVal = parseFloat(input.value) || 0;
                if (currentVal > 0) {
                    input.value = Math.max(0, currentVal - 1);
                    item.fact_qty = parseFloat(input.value) || 0;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            
            const btnPlus = document.createElement('button');
            btnPlus.type = 'button';
            btnPlus.className = 'qty-btn qty-btn-plus';
            btnPlus.textContent = '+';
            btnPlus.style.margin = '0';
            btnPlus.addEventListener('click', (e) => {
                e.preventDefault();
                const currentVal = parseFloat(input.value) || 0;
                input.value = currentVal + 1;
                item.fact_qty = parseFloat(input.value) || 0;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            qtyControls.appendChild(btnMinus);
            qtyControls.appendChild(input);
            qtyControls.appendChild(btnPlus);

            const html = `
                <td>${idx + 1}</td>
                <td>${item.sku}</td>
                <td>${item.name}</td>
                <td class="edit-column"></td>
            `;
            
            tr.innerHTML = html;
            tr.querySelector('.edit-column').appendChild(qtyControls);
            tbody.appendChild(tr);
        });

        // Добавляем строку для добавления товара в конце
        addProductRow.innerHTML = `
            <td colspan="4" style="text-align: center; padding: 20px">
                <span class="add-product-link" onclick="inventManager.showAddProductModal()">
                    ➕ Добавить товар
                </span>
            </td>
        `;
        tbody.appendChild(addProductRow);

        // Показываем/скрываем кнопки
        const sendBtn = document.getElementById('btnSendInvent');
        const resetBtn = document.getElementById('btnResetZero');
        if (sendBtn && resetBtn) {
            if (this.inventoryItems.length > 0) {
                sendBtn.style.display = 'inline-block';
                resetBtn.style.display = 'inline-block';
            } else {
                sendBtn.style.display = 'none';
                resetBtn.style.display = 'none';
            }
        }
    }

    resetAllToZero() {
        if (confirm('Уверены? Все значения будут обнулены')) {
            this.inventoryItems.forEach(item => {
                item.fact_qty = 0;
            });
            this.renderTable();
            this.showStatus('🔄 Все поля обнулены', 'info');
        }
    }

    sendQuantities() {
        // Сразу отправляем на сервер без модального окна
        const payloads = this.inventoryItems.map(item => ({
            "product-id": item.productId,
            "qtn": item.fact_qty,
            "sku": item.sku
        }));

        const payload = {
            session_id: this.sessionId,
            jwt_token: this.apiConfig.jwt,
            payloads: payloads,
            notes: '' // Комментарий будет добавлен позже в режиме "только комментарий"
        };

        this.showStatus('⏳ Отправка данных на сервер...', 'loading');

        fetch('/api/update-quantities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    // Сохраняем отправленные товары
                    this.sentItems = JSON.parse(JSON.stringify(this.inventoryItems));
                    
                    this.showStatus('✅ Данные успешно отправлены', 'success');
                    this.switchToCommentsPhase();
                } else {
                    this.showStatus(`❌ Ошибка при отправке: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(e => {
                this.showStatus(`❌ Ошибка отправки: ${e.message}`, 'error');
                console.error('Ошибка отправки:', e);
            });
    }

    closeCommentModal() {
        const commentModal = document.getElementById('commentModal');
        if (commentModal) {
            commentModal.classList.remove('active');
        }
    }

    submitWithComment() {
        const comment = document.getElementById('commentInput').value.trim();
        this.closeCommentModal();
        // Этот метод больше не используется в новой логике
    }

    switchToCommentsPhase() {
        this.currentPhase = 'comments';
        
        // Скрываем таблицу
        document.getElementById('inventTable').style.display = 'none';
        
        // Показываем комментарии
        const commentsStage = document.getElementById('commentsStage');
        if (commentsStage) {
            commentsStage.style.display = 'block';
            
            // Заполняем список товаров
            const container = document.getElementById('commentsContainer');
            container.innerHTML = this.sentItems.map((item, idx) => `
                <div style="padding: 10px; background: var(--light-color); margin-bottom: 8px; border-radius: 4px; border-left: 3px solid var(--primary-color)">
                    <strong>${idx + 1}. ${item.sku} - ${item.name}</strong>
                    <div style="font-size: 13px; color: var(--gray-color); margin-top: 4px">
                        Доставлено: <strong>${item.fact_qty}</strong>
                    </div>
                </div>
            `).join('');
            
            // Очищаем текстарею для комментария
            document.getElementById('commentsText').value = '';
        }
    }

    backToEdit() {
        if (confirm('Вернуться к редактированию таблицы? Вы сможете отредактировать товары и отправить заново')) {
            this.currentPhase = 'edit';
            
            // Восстанавливаем таблицу
            document.getElementById('inventTable').style.display = 'block';
            document.getElementById('commentsStage').style.display = 'none';
            
            // Данные остаются в inventoryItems, они не будут потеряны
            this.renderTable();
            this.showStatus('← Вы вернулись к редактированию', 'info');
        }
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        if (statusDiv) {
            statusDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
            
            // Автоматически скрываем сообщение через 5 секунд (только для success/info)
            if (['success', 'info'].includes(type)) {
                setTimeout(() => {
                    if (statusDiv.innerHTML.includes(message)) {
                        statusDiv.innerHTML = '';
                    }
                }, 5000);
            }
        }
    }
}

// Инициализируем менеджер инвентаризации
const inventManager = new InventoryManager();
