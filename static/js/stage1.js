class Stage1 {
    constructor() {
        this.uploadedFile = null;
        this.transformedData = null;
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
        document.getElementById('resetBtn').addEventListener('click', () => {
            if (confirm('Начать заново?')) location.reload();
        });
    }

    authenticate() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const loginStatus = document.getElementById('loginStatus');
        
        if (!username || !password) {
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
            if (d.success && (d.token || d.jwt_token)) {
                const jwtToken = d.token || d.jwt_token;
                // Сохраняем токен в localStorage
                localStorage.setItem('jwtToken', jwtToken);                
                // Скрываем форму логина, показываем загрузку файла
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('upload-section').style.display = 'block';
                loginStatus.innerHTML = '<div style="background: #d4edda; color: #155724; padding: 10px; border-radius: 4px; font-size: 14px;">✅ Вход успешен!</div>';
            } else {
                loginStatus.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 10px; border-radius: 4px; font-size: 14px;">❌ ${d.error || 'Ошибка аутентификации'}</div>`;
            }
        })
        .catch(e => {
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
        this.uploadMultipleFiles(files, 0, []);
    }
    
    uploadMultipleFiles(files, index, uploadedFiles) {
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
        
        fetch('/api/upload-file', { method: 'POST', body: fd })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    uploadedFiles.push(file.name);
                    console.log(`✓ Файл ${index + 1} загружен: ${file.name}`);
                    // Загружаем следующий файл
                    this.uploadMultipleFiles(files, index + 1, uploadedFiles);
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
        this.showStatus('transformStatus', '<div class="status-message"><div class="spinner"></div><span>Обработка файлов...</span></div>', 'loading');
        fetch('/api/transform-file', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    this.transformedData = d.data;
                    console.log(`📊 Обработано ${d.count} записей из ${d.files_processed || 1} файлов`);
                    console.log(`   - Данные (первые 5 записей):`);
                    console.table(d.data.slice(0, 5));
                    
                    let statusMsg = `✓ Обработано: ${d.count} записей`;
                    if (d.files_processed > 1) {
                        statusMsg += ` из ${d.files_processed} файлов`;
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
            const row = document.createElement('tr');
            row.className = 'table-row';
            row.innerHTML = `
                <td class="col-num">${i + 1}</td>
                <td class="col-sku">${this.esc(item.sku || '')}</td>
                <td class="col-name">${this.esc(item.name || '')}</td>
                <td class="col-qty-invoice" style="text-align: center;">${item.qtn_invoice || 0}</td>
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
            qtn: item.qtn_invoice || 0
        }));        console.table(data.slice(0, 5));

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
                localStorage.setItem('invoiceNames', JSON.stringify(invoiceNames));                console.log(`   - SKU для Stage 2: ${Object.keys(invoiceData).length}`);                
                const msg = document.createElement('div');
                msg.className = 'upload-status status-success status-message';
                msg.innerHTML = '✓ Данные сохранены!';
                btn.parentElement.insertBefore(msg, btn);
                btn.style.display = 'none';
                
                const next = document.createElement('button');
                next.className = 'btn btn-primary';
                next.innerHTML = '<span class="btn-icon">➜</span>Этап 2 (API)';
                next.addEventListener('click', () => window.location.href = '/stage2');
                btn.parentElement.appendChild(next);
            } else {                alert('Ошибка: ' + (r.error || 'неизвестная'));
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
