class Stage1 {
    constructor() {
        this.uploadedFile = null;
        this.transformedData = null;
        this.exordMode = false;
        this.exordColumn = 'отправлено';
        this.sessionId = this.getOrCreateSessionId();
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
        this.setupUploadArea();
        document.getElementById('transformBtn').addEventListener('click', () => this.transformFile());
        document.getElementById('validateBtn').addEventListener('click', () => this.validateAndSave());

        const exordOptions = document.getElementById('exordOptions');
        const branchRadios = document.querySelectorAll('input[name="branchTarget"]');

        const updateBranchUI = () => {
            const branchChoice = document.querySelector('input[name="branchTarget"]:checked');
            const isSells = branchChoice && branchChoice.value === 'sells';
            exordOptions.style.display = isSells ? 'block' : 'none';
        };

        branchRadios.forEach(radio => {
            radio.addEventListener('change', updateBranchUI);
        });
        updateBranchUI();
    }

    authenticate() {
        console.log('🔵 authenticate() вызвана в Stage1Manager');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const loginStatus = document.getElementById('loginStatus');
        
        console.log(`📝 Попытка входа: username="${username}"`);
        
        if (!username || !password) {
            console.log('❌ Поля пусты');
            loginStatus.innerHTML = '<div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; font-size: 14px;">❌ Заполните логин и пароль</div>';
            return;
        }

        loginStatus.innerHTML = '<div style="background: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 4px; font-size: 14px;">⏳ Аутентификация...</div>';
        
        fetch('/api/get-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        .then(r => r.json())
        .then(d => {
            console.log('🔵 Ответ от /api/get-token (Stage1):', { success: d.success });
            if (d.success && (d.token || d.jwt_token)) {
                const jwtToken = d.token || d.jwt_token;
                // Сохраняем токен в localStorage
                localStorage.setItem('jwtToken', jwtToken);
                // Сохраняем логин в localStorage для использования в Stage 2
                console.log('💾 Сохраняю accountLogin в localStorage:', username);
                localStorage.removeItem('accountLogin');
                localStorage.setItem('accountLogin', username);
                console.log('✅ Логин сохранён в localStorage:', username);
                // Скрываем форму логина, показываем загрузку файла
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('upload-section').style.display = 'block';
                loginStatus.innerHTML = '<div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 4px; font-size: 14px;">✅ Вход успешен!</div>';
            } else {
                console.log('❌ Ошибка аутентификации (Stage1):', d.error);
                loginStatus.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; font-size: 14px;">❌ ${d.error || 'Ошибка аутентификации'}</div>`;
            }
        })
        .catch(e => {
            console.log('❌ Ошибка fetch (Stage1):', e.message);
            loginStatus.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; font-size: 14px;">❌ ${e.message}</div>`;
        });
    }

    setupUploadArea() {
        const upload = document.getElementById('uploadArea');
        const input = document.getElementById('fileInput');

        upload.addEventListener('click', () => input.click());
        input.addEventListener('change', (e) => e.target.files.length && this.handleMultipleFiles(e.target.files));
        
        upload.addEventListener('dragover', (e) => {
            e.preventDefault();
            upload.classList.add('dragover');
        });

        upload.addEventListener('dragleave', () => upload.classList.remove('dragover'));
        upload.addEventListener('drop', (e) => {
            e.preventDefault();
            upload.classList.remove('dragover');
            e.dataTransfer.files.length && this.handleMultipleFiles(e.dataTransfer.files);
        });
    }

    handleMultipleFiles(files) {
        // Получаем расширение первого файла
        const firstExt = '.' + files[0].name.split('.').pop().toLowerCase();
        if (!['.xlsx', '.xls', '.xlsm', '.docx'].includes(firstExt)) {
            this.showStatus('uploadStatus', 'Допускаются Excel (.xlsx, .xls, .xlsm) и Word (.docx) файлы', 'error');
            return;
        }
        
        // Проверяем что все файлы одного расширения
        const invalidFiles = [];
        for (let file of files) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (ext !== firstExt) {
                invalidFiles.push(file.name);
            }
        }
        
        if (invalidFiles.length > 0) {
            this.showStatus('uploadStatus', `❌ Все файлы должны быть одного расширения (.${firstExt.substring(1)})! Ошибочные: ${invalidFiles.join(', ')}`, 'error');
            return;
        }
        
        // Загружаем все файлы
        console.log(`📁 Начинаем загрузку ${files.length} файлов...`);
        this.showStatus('uploadStatus', `<div class="status-message"><div class="spinner"></div><span>Загрузка ${files.length} файлов...</span></div>`, 'loading');
        this.uploadMultipleFiles(files, 0, [], true);
    }
    
    uploadMultipleFiles(files, index, uploadedFiles, resetBatch = false) {
        if (index >= files.length) {
            // Все файлы загружены
            this.uploadedFiles = uploadedFiles;
            const fileList = uploadedFiles.map((f, i) => `${i + 1}. ${f}`).join('<br>');
            this.showStatus('uploadStatus', `✓ Загружено ${uploadedFiles.length} файлов:<br>${fileList}`, 'success');
            document.getElementById('transform-section').style.display = 'block';
            return;
        }
        
        const file = files[index];
        const fd = new FormData();
        fd.append('file', file);
        if (resetBatch && index === 0) {
            fd.append('reset', '1');
        }
        
        fetch('/api/upload-file', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    uploadedFiles.push(file.name);
                    console.log(`✓ Файл ${index + 1} загружен: ${file.name}`);
                    // Загружаем следующий файл
                    this.uploadMultipleFiles(files, index + 1, uploadedFiles, false);
                } else {
                    throw new Error(`Ошибка загрузки ${file.name}: ${d.error}`);
                }
            })
            .catch(e => {
                this.showStatus('uploadStatus', `❌ ${e.message}`, 'error');
            });
    }

    handleFile(file) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!['.xlsx', '.xls', '.xlsm', '.docx'].includes(ext)) {
            this.showStatus('uploadStatus', 'Допускаются Excel (.xlsx, .xls, .xlsm) и Word (.docx) файлы', 'error');
            return;
        }
        
        const fd = new FormData();
        fd.append('file', file);
        this.showStatus('uploadStatus', '<div class="status-message"><div class="spinner"></div><span>Загрузка...</span></div>', 'loading');

        fetch('/api/upload-file', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    this.uploadedFile = file.name;
                    this.showStatus('uploadStatus', `✓ Файл загружен`, 'success');
                    document.getElementById('transform-section').style.display = 'block';
                } else {
                    this.showStatus('uploadStatus', d.error, 'error');
                }
            })
            .catch(e => this.showStatus('uploadStatus', 'Ошибка: ' + e.message, 'error'));
    }

    transformFile() {
        const btn = document.getElementById('transformBtn');
        btn.disabled = true;
        const branchChoice = document.querySelector('input[name="branchTarget"]:checked');
        const isSells = branchChoice && branchChoice.value === 'sells';
        const exordMode = !!isSells;
        
        // Получаем выбранный столбец (по умолчанию "отправлено")
        let exordColumn = 'отправлено';
        if (exordMode) {
            const selectedColumn = document.querySelector('input[name="exordColumn"]:checked');
            if (selectedColumn) {
                exordColumn = selectedColumn.value;
            }
        }

        this.exordMode = exordMode;
        this.exordColumn = exordColumn;
        
        console.log('🔵 Режим Экзорд:', exordMode ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН');
        if (exordMode) {
            console.log('📋 Выбранный столбец:', exordColumn);
        }
        
        this.showStatus('transformStatus', '<div class="status-message"><div class="spinner"></div><span>Обработка файлов...</span></div>', 'loading');
        fetch('/api/transform-file', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                exord_mode: exordMode,
                exord_column: exordColumn
            })
        })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    this.transformedData = d.data;
                    this.documentNumbers = d.document_numbers || [];
                    localStorage.setItem('exordMode', exordMode ? '1' : '0');
                    localStorage.setItem('exordColumn', exordColumn);
                    console.log(`📊 Обработано ${d.count} записей из ${d.files_processed || 1} файлов`);
                    if (d.document_numbers && d.document_numbers.length > 0) {
                        console.log(`📋 Номера документов: ${d.document_numbers.join(', ')}`);
                    }
                    console.log(`   - Данные (первые 5 записей):`);
                    console.table(d.data.slice(0, 5));
                    
                    let statusMsg = `✓ Обработано: ${d.count} записей`;
                    if (d.files_processed > 1) {
                        statusMsg += ` из ${d.files_processed} файлов`;
                    }
                    if (d.document_numbers && d.document_numbers.length > 0) {
                        statusMsg += `<br>📋 Номера документов: ${d.document_numbers.join(', ')}`;
                    }
                    if (d.errors && d.errors.length > 0) {
                        statusMsg += `<br>⚠️ Ошибки: ${d.errors.join('<br>')}`;
                    }
                    
                    this.showStatus('transformStatus', statusMsg, 'success');
                    this.populateTable();
                    document.getElementById('table-section').style.display = 'block';
                } else {
                    this.showStatus('transformStatus', d.error, 'error');
                }
            })
            .catch(e => {
                this.showStatus('transformStatus', 'Ошибка: ' + e.message, 'error');
            })
            .finally(() => btn.disabled = false);
    }

    populateTable() {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';

        this.transformedData.forEach((item, i) => {
            const invoiceDisplayQty =
                this.exordMode
                    ? (item.qtn_delivered ?? item.qtn_invoice ?? 0)
                    : (item.qtn_invoice ?? 0);

            const row = document.createElement('tr');
            row.className = 'table-row';

            // Highlight row when sent vs delivered don't match
            const sentRaw = (item.qtn_sent ?? '').toString().trim();
            const deliveredRaw = (item.qtn_delivered ?? '').toString().trim();
            const sentQty = parseFloat(sentRaw);
            const deliveredQty = parseFloat(deliveredRaw);
            const sentHasNumber = !Number.isNaN(sentQty);
            const deliveredHasNumber = !Number.isNaN(deliveredQty);
            const hasSentDeliveredDifference = sentHasNumber && deliveredHasNumber
                ? sentQty !== deliveredQty
                : (sentHasNumber !== deliveredHasNumber);

            if (hasSentDeliveredDifference) {
                row.classList.add('row-warning');
                row.style.backgroundColor = '#ff000078';
            }
            row.innerHTML = `
                <td class="col-num">${i + 1}</td>
                <td class="col-sku">${this.esc(item.sku || '')}</td>
                <td class="col-name">${this.esc(item.name || '')}</td>
                <td class="col-qty-invoice" style="text-align: center;">${invoiceDisplayQty}</td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('totalItems').textContent = this.transformedData.length;
        document.getElementById('totalItemsClone').textContent = this.transformedData.length;
        this.updateStats();
    }
    
    validateInput(input) {
        const val = input.value.trim();
        input.classList.remove('empty', 'valid', 'error');

        if (val === '') {
            input.classList.add('empty');
            return false;
        }
        if (val.toLowerCase() === 'нету') {
            input.classList.add('valid');
            return true;
        }
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
            input.classList.add('error');
            return false;
        }
        input.classList.add('valid');
        return true;
    }

    updateStats() {
        if (this.transformedData && this.transformedData.length > 0) {
            document.getElementById('filledItems').textContent = this.transformedData.length;
        }
    }

    validateAndSave() {
        // Проверяем что данные загружены
        if (!this.transformedData || this.transformedData.length === 0) {
            alert('Ошибка: Сначала загрузите и обработайте файл!');
            return;
        }

        // Теперь нет input полей для "По факту", просто используем данные из таблицы
        const data = this.transformedData.map(item => ({
            sku: item.sku,
            qtn: (this.exordMode && this.exordColumn === 'доставлено')
                ? (item.qtn_sent ?? item.qtn_invoice ?? 0)
                : (item.qtn_invoice ?? 0)
        }));        console.table(data.slice(0, 5));

        const branchChoice = document.querySelector('input[name="branchTarget"]:checked');
        if (!branchChoice) {
            alert('Выберите ветку: Sells или По отдельности');
            return;
        }
        const branchTarget = branchChoice.value;
        localStorage.setItem('branchTarget', branchTarget);

        document.getElementById('validationErrors').style.display = 'none';
        
        const btn = document.getElementById('validateBtn');
        btn.disabled = true;

        fetch('/api/save-stage1-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: this.sessionId, data })
        })
        .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error); }))
        .then(r => {
            if (r.success) {                
                // Сохраняем данные накладной в localStorage для Stage 2
                const invoiceData = {};
                const invoiceNames = {}; // Сохраняем названия из накладной
                data.forEach(item => {
                    invoiceData[item.sku] = item.qtn; // sku -> qtn (по накладной)
                    invoiceNames[item.sku] = this.transformedData.find(t => t.sku === item.sku)?.name || item.sku; // Название из таблицы
                });
                localStorage.setItem('invoiceData', JSON.stringify(invoiceData));
                localStorage.setItem('invoiceNames', JSON.stringify(invoiceNames));
                // Сохраняем все трансформированные данные (включая document_number)
                localStorage.setItem('transformedData', JSON.stringify(this.transformedData));
                if (this.documentNumbers && this.documentNumbers.length > 0) {
                    localStorage.setItem('documentNumbers', JSON.stringify(this.documentNumbers));
                }
                console.log(`   - SKU для Stage 2: ${Object.keys(invoiceData).length}`);
                if (this.documentNumbers && this.documentNumbers.length > 0) {
                    console.log(`   - Номера документов: ${this.documentNumbers.join(', ')}`);
                }
                
                const msg = document.createElement('div');
                msg.className = 'upload-status status-success status-message';
                msg.innerHTML = '✓ Данные сохранены!';
                btn.parentElement.insertBefore(msg, btn);
                btn.style.display = 'none';
                
                const next = document.createElement('button');
                next.className = 'btn btn-primary';
                const nextUrl = branchTarget === 'radix' ? '/radix' : '/stage2';
                const nextLabel = branchTarget === 'radix' ? 'По отдельности' : 'Sells';
                next.innerHTML = `<span class="btn-icon">➜</span>${nextLabel}`;
                next.addEventListener('click', () => window.location.href = nextUrl);
                btn.parentElement.appendChild(next);
            } else {
                alert('❌ Ошибка: ' + (r.error || 'неизвестная'));
                btn.disabled = false;
            }
        })
        .catch(e => {            alert('Ошибка: ' + e.message);
            btn.disabled = false;
        });
    }

    showStatus(id, msg, type) {
        const el = document.getElementById(id);
        el.style.display = 'block';
        el.className = `upload-status status-${type}`;
        el.innerHTML = msg;
    }
    esc(text) {
        const m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, c => m[c]);
    }
}

// Создаем глобальный объект для использования в HTML
let stage1;
document.addEventListener('DOMContentLoaded', () => {
    stage1 = new Stage1();
});
