from flask import Blueprint, render_template, request, jsonify, session, current_app
import os, json, subprocess, sys
from pathlib import Path
import requests
from datetime import datetime
from .session_manager import SessionManager
try:
    import openpyxl
except ImportError:
    openpyxl = None

main_bp = Blueprint('main', __name__)
api_bp = Blueprint('api', __name__)

SCRIPTS_PATH = Path(__file__).parent
TRANSFORM_HANDLER = SCRIPTS_PATH / 'transform_handler.py'

@main_bp.route('/')
def index():
    return render_template('stage1.html')

@main_bp.route('/stage2')
def stage2():
    return render_template('stage2.html')

@main_bp.route('/login')
def login():
    return render_template('login.html')

@main_bp.route('/test')
def test():
    return render_template('test.html')

@api_bp.route('/get-token', methods=['POST'])
def get_token():
    """Получить JWT токен через логин/пароль"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        if not username or not password:
            return jsonify({'success': False, 'error': 'Заполните логин и пароль'}), 400
        
        # POST запрос к API для получения токена
        url = "https://orderconfirmer-api.safiadelivery.com/api/account/token"
        payload = {
            "login": username,
            "password": password
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=10)
            
            try:
                resp_data = response.json()
            except:
                resp_data = None
            
            if response.status_code == 200:
                # Проверяем успешность ответа
                if resp_data and resp_data.get('success'):
                    # API возвращает токен в response.data.token
                    if resp_data.get('data') and 'token' in resp_data['data']:
                        token = resp_data['data']['token']
                        return jsonify({
                            'success': True,
                            'token': token,
                            'message': 'Токен получен успешно'
                        }), 200
                    else:
                        return jsonify({
                            'success': False,
                            'error': 'Токен не найден в ответе сервера'
                        }), 400
                else:
                    # success: false - неверные креденшалы или ошибка API
                    return jsonify({
                        'success': False,
                        'error': 'Неверные учётные данные или ошибка сервера'
                    }), 401
            else:
                return jsonify({
                    'success': False,
                    'error': f'Ошибка при логине: статус {response.status_code}'
                }), response.status_code
                
        except requests.exceptions.Timeout:
            return jsonify({'success': False, 'error': 'Timeout при подключении к API'}), 408
        except Exception as e:
            return jsonify({'success': False, 'error': f'Ошибка запроса: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/upload-file', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не найден'}), 400
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'}), 400
        
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in {'.xlsx', '.xls', '.xlsm', '.docx'}:
            return jsonify({'success': False, 'error': 'Допускаются только Excel (.xlsx, .xls, .xlsm) и Word (.docx) файлы'}), 400
        
        upload_folder = Path(current_app.config['UPLOAD_FOLDER'])
        upload_folder.mkdir(parents=True, exist_ok=True)
        file_path = upload_folder / file.filename
        file.save(str(file_path))
        
        # Сохраняем список файлов вместо одного файла
        if 'uploaded_files' not in session:
            session['uploaded_files'] = []
        session['uploaded_files'].append(str(file_path))
        session['uploaded_file'] = str(file_path)  # Для обратной совместимости
        session['original_filename'] = file.filename
        session.modified = True
        print(f'📤 Загружен файл: {file.filename}')
        print(f'   Всего файлов в сессии: {len(session["uploaded_files"])}')
        return jsonify({'success': True, 'filename': file.filename}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/transform-file', methods=['POST'])
def transform_file():
    try:
        # Получаем список файлов для обработки
        uploaded_files = session.get('uploaded_files', [])
        print(f'\n🔍 /transform-file запрос:')
        print(f'   Файлов в сессии: {len(uploaded_files)}')
        
        if not uploaded_files:
            # Для обратной совместимости - пытаемся использовать старый ключ
            single_file = session.get('uploaded_file')
            if not single_file:
                return jsonify({'success': False, 'error': 'Файлы не загружены'}), 400
            uploaded_files = [single_file]
        
        all_data = []
        errors = []
        
        # Обрабатываем каждый файл
        for file_path in uploaded_files:
            filename = os.path.basename(file_path)
            if not os.path.exists(file_path):
                errors.append(f'Файл не найден: {filename}')
                print(f'   ❌ Файл не найден: {filename}')
                continue
            
            try:
                print(f'   ⚙️ Обработка: {filename}')
                result = subprocess.run(
                    [sys.executable, str(TRANSFORM_HANDLER), '--source', file_path],
                    capture_output=True, text=True, timeout=30
                )
                
                if result.returncode != 0:
                    errors.append(f'Ошибка обработки {filename}: {result.stderr}')
                    print(f'   ❌ Ошибка обработки {filename}')
                    continue
                
                try:
                    output_json = json.loads(result.stdout)
                    all_data.extend(output_json)  # Добавляем данные из этого файла
                    print(f'   ✓ {filename}: {len(output_json)} записей')
                except json.JSONDecodeError:
                    errors.append(f'Некорректный формат данных в {filename}')
                    print(f'   ❌ Некорректный JSON в {filename}')
            except subprocess.TimeoutExpired:
                errors.append(f'Время обработки истекло для {filename}')
                print(f'   ⏱️ Таймаут обработки {filename}')
        
        if not all_data and errors:
            print(f'❌ Ошибка: нет обработанных данных\n')
            return jsonify({'success': False, 'error': '; '.join(errors)}), 500
        
        session['transformed_data'] = all_data
        # ОЧИЩАЕМ список загруженных файлов после обработки - так они не обработаются снова!
        session['uploaded_files'] = []
        session.modified = True
        
        message = f'Обработано {len(all_data)} записей из {len(uploaded_files)} файлов'
        if errors:
            message += f'. Ошибки: {"; ".join(errors)}'
        
        print(f'✅ Итого обработано: {len(all_data)} записей из {len(uploaded_files)} файлов')
        print(f'   Список файлов очищен, новый размер: {len(session.get("uploaded_files", []))}\n')
        
        return jsonify({
            'success': True, 
            'data': all_data, 
            'count': len(all_data),
            'message': message,
            'files_processed': len(uploaded_files),
            'errors': errors if errors else None
        }), 200
        
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'error': 'Время обработки истекло'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/save-stage1-data', methods=['POST'])
def save_stage1_data():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Данные не переданы'}), 400
        
        session_id = data.get('session_id')
        rows = data.get('data', [])
        if not session_id or not rows:
            return jsonify({'success': False, 'error': 'Отсутствуют обязательные параметры'}), 400
        
        errors = []
        for i, row in enumerate(rows):
            qtn = row.get('qtn')
            if qtn is None or qtn == '':
                errors.append(f"Строка {i+1}: поле не заполнено")
                continue
            if qtn != 'нету':
                try:
                    float(qtn)
                except ValueError:
                    errors.append(f"Строка {i+1}: '{qtn}' не число")
        
        if errors:
            return jsonify({'success': False, 'errors': errors}), 400
        
        session_manager = SessionManager(session_id)
        session_manager.save_json('stage1_data.json', {'data': rows}, 'temp')
        session_manager.log(f"✅ Этап 1: {len(rows)} записей")
        
        payloads = []
        for row in rows:
            qtn = row.get('qtn', 0)
            if isinstance(qtn, str):
                # Оставляем float чтобы поддерживать дробные числа (например, 2.5)
                try:
                    qtn = 0.0 if qtn.lower() == 'нету' else float(qtn)
                except (ValueError, AttributeError):
                    qtn = 0.0
            else:
                # Преобразуем в float, чтобы сохранить дробные части
                qtn = float(qtn) if qtn else 0.0
            
            # Создаем payload без productId (он будет добавлен на stage2 из /api/get-menu-items)
            payloads.append({
                "sku": row.get('sku'),
                "qtn": qtn  # Теперь может быть дробное число (2.5, 3.75 и т.д.)
            })
        
        session_manager.save_json('payloads.json', {'payloads': payloads}, 'temp')
        print("\n" + "="*60)
        print("📊 PAYLOADS (Stage 1):")
        print("="*60)
        print(json.dumps(payloads, indent=2, ensure_ascii=False))
        print("="*60 + "\n")
        
        session_manager.log(f"📊 Payloads: {len(payloads)} записей")
        session['stage1_data'] = rows
        session['payloads'] = payloads
        session.modified = True
        return jsonify({'success': True, 'message': 'Данные сохранены'}), 200
        
    except Exception as e:
        print(f"❌ ОШИБКА: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
@api_bp.route('/check-api-connection', methods=['POST'])
def check_api_connection():
    try:
        data = request.get_json()
        session_id, jwt_token = data.get('session_id'), data.get('jwt_token', '').strip()
        url_menus = data.get('url_menus', '').strip()
        
        if not all([session_id, jwt_token, url_menus]):
            return jsonify({'success': False, 'error': 'Отсутствуют параметры'}), 400
        
        session_manager = SessionManager(session_id)
        session_manager.log("🔍 Проверка подключения...")
        
        try:
            headers = {"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"}
            response = requests.get(url_menus, headers=headers, timeout=10)
            
            if response.status_code == 200:
                session_manager.log("✅ Подключение успешно")
                config = {
                    'jwt_token': jwt_token,
                    'url_menus': url_menus,
                    'url_change_qty': data.get('url_change_qty', '').strip(),
                    'tested_at': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                session_manager.save_config(config)
                return jsonify({'success': True, 'message': 'Подключение успешно'}), 200
            else:
                # Попытаемся получить сообщение об ошибке от сервера
                error_msg = None
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error') or error_data.get('message') or str(error_data)
                except:
                    error_msg = response.text or f"HTTP {response.status_code}"
                
                error = f"Ошибка {response.status_code}: {error_msg}"
                session_manager.log(f"❌ {error}", "ERROR")
                return jsonify({'success': False, 'error': error, 'status_code': response.status_code}), 400
                
        except requests.exceptions.Timeout:
            session_manager.log("❌ Timeout", "ERROR")
            return jsonify({'success': False, 'error': 'Timeout при подключении к серверу'}), 408
        except requests.exceptions.ConnectionError:
            session_manager.log("❌ Ошибка подключения", "ERROR")
            return jsonify({'success': False, 'error': 'Ошибка подключения к серверу'}), 503
        except Exception as e:
            session_manager.log(f"❌ {str(e)}", "ERROR")
            return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/get-server-items', methods=['POST'])
def get_server_items():
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        jwt_token = data.get('jwt_token', '').strip()
        url_menus = data.get('url_menus', '').strip()
        
        if not all([session_id, jwt_token, url_menus]):
            return jsonify({'success': False, 'error': 'Отсутствуют параметры'}), 400
        
        session_manager = SessionManager(session_id)
        session_manager.log("📥 Загрузка товаров...")
        
        # Загружаем payloads из Stage 1
        payloads_data = session_manager.load_json('payloads.json', 'temp') or {}
        payloads = payloads_data.get('payloads', []) if isinstance(payloads_data, dict) else payloads_data
        
        # Создаем набор SKU из Stage 1
        sku_set = {p.get('sku') for p in payloads if isinstance(p, dict) and 'sku' in p}
        qtn_map = {p.get('sku'): float(p.get('qtn', 0)) for p in payloads if isinstance(p, dict)}  # Гарантируем float
        
        try:
            headers = {"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"}
            response = requests.get(url_menus, headers=headers, timeout=15)
            
            if response.status_code == 200:
                server_data = response.json()
                
                # Фильтруем данные: оставляем только sku, nameRu, qtn
                filtered_data = {"data": []}
                
                if isinstance(server_data, dict) and 'data' in server_data:
                    for category in server_data['data']:
                        filtered_category = {
                            "nameRu": category.get("nameRu", ""),
                            "products": []
                        }
                        
                        if 'products' in category and isinstance(category['products'], list):
                            for product in category['products']:
                                # Включаем только товары из Stage 1 (sku_set)
                                if product.get('sku') in sku_set:
                                    filtered_product = {
                                        "sku": product.get("sku", ""),
                                        "nameRu": product.get("nameRu", ""),
                                        "qtn": float(product.get("qtn", 0))  # Гарантируем float
                                    }
                                    filtered_category["products"].append(filtered_product)
                        
                        # Добавляем категорию только если в ней есть товары
                        if filtered_category["products"]:
                            filtered_data["data"].append(filtered_category)
                
                session_manager.save_json('server_items.json', filtered_data, 'temp')
                session_manager.log("✅ Товары получены и отфильтрованы")
                
                return jsonify({'success': True, 'data': filtered_data, 'qtn_map': qtn_map}), 200
            else:
                # Попытаемся получить сообщение об ошибке от сервера
                error_msg = None
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error') or error_data.get('message') or str(error_data)
                except:
                    error_msg = response.text or f"HTTP {response.status_code}"
                
                error = f"Ошибка {response.status_code}: {error_msg}"
                session_manager.log(f"❌ {error}", "ERROR")
                return jsonify({'success': False, 'error': error, 'status_code': response.status_code}), 400
                
        except requests.exceptions.Timeout:
            session_manager.log("❌ Timeout", "ERROR")
            return jsonify({'success': False, 'error': 'Timeout'}), 408
        except requests.exceptions.ConnectionError as e:
            session_manager.log(f"❌ Ошибка подключения", "ERROR")
            return jsonify({'success': False, 'error': f'Ошибка подключения'}), 503
        except Exception as e:
            session_manager.log(f"❌ {str(e)}", "ERROR")
            return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@api_bp.route('/load-config', methods=['GET'])
def load_config():
    try:
        session_id = request.args.get('session_id')
        if not session_id:
            return jsonify({'config': None}), 200
        config = SessionManager(session_id).load_config()
        return jsonify({'config': config}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/save-api-config', methods=['POST'])
def save_api_config():
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        config = data.get('config')
        
        if not session_id or not config:
            return jsonify({'success': False, 'error': 'Отсутствуют параметры'}), 400
        
        sm = SessionManager(session_id)
        sm.save_config(config)
        sm.save_state({'current_stage': 2, 'completed': True})
        return jsonify({'success': True, 'message': 'Сохранено'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/get-menu-items', methods=['POST'])
def get_menu_items():
    """GET запрос к API, фильтрация по invoice_data из Stage 1 и возврат таблицы"""
    try:
        if not openpyxl:
            return jsonify({'success': False, 'error': 'openpyxl не установлена'}), 500
        
        data = request.get_json()
        # Принимаем как jwt, так и jwt_token для совместимости
        jwt_token = data.get('jwt') or data.get('jwt_token', '').strip()
        invoice_data = data.get('invoice_data', {})  # Получаем invoiceData со Stage 1
        invoice_names = data.get('invoice_names', {})  # Получаем названия товаров
        
        if not jwt_token:
            return jsonify({'success': False, 'error': 'JWT токен не предоставлен'}), 400
        
        print(f"\n{'='*60}")
        print("📥 GET-MENU-ITEMS получил запрос:")
        print(f"   - JWT токен: {jwt_token[:30]}...")
        print(f"   - invoice_data: {invoice_data}")
        print(f"   - Количество SKU в invoice_data: {len(invoice_data)}")
        print(f"   - Количество названий в invoice_names: {len(invoice_names)}")
        print(f"{'='*60}\n")
        
        # Если invoice_data пустой, берём данные из cleaned_result.xlsx как fallback
        if not invoice_data:
            print("⚠️ invoice_data пуст, используем fallback: cleaned_result.xlsx")
            vendor_path = Path(__file__).parent.parent.parent / 'vendor'
            cleaned_file = vendor_path / 'cleaned_result.xlsx'
            
            if not cleaned_file.exists():
                return jsonify({'success': False, 'error': 'cleaned_result.xlsx не найден'}), 404
            
            # Читаем SKU коды и количества из cleaned_result.xlsx
            sku_list = []
            try:
                wb = openpyxl.load_workbook(str(cleaned_file))
                ws = wb.active
                if ws is None:
                    return jsonify({'success': False, 'error': 'Ошибка при открытии Excel'}), 500
                
                for row in ws.iter_rows(min_row=1, values_only=True):
                    if row and row[0]:
                        sku = str(row[0]).strip()
                        qtn = row[3] if len(row) > 3 else 0
                        try:
                            qtn = float(qtn) if qtn else 0.0
                        except (ValueError, TypeError):
                            qtn = 0.0
                        sku_list.append((sku, qtn))
            except Exception as e:
                return jsonify({'success': False, 'error': f'Ошибка чтения Excel: {str(e)}'}), 500
            
            invoice_data = {sku: qtn for sku, qtn in sku_list}
        
        # GET запрос к API
        url = "https://orderconfirmer-api.safiadelivery.com/api/menu/Menus"
        try:
            response = requests.get(
                url,
                headers={"Authorization": f"Bearer {jwt_token}"},
                timeout=10
            )
            
            if response.status_code != 200:
                return jsonify({'success': False, 'error': f'API вернул статус {response.status_code}'}), 400
            
            api_data = response.json()
        except requests.exceptions.Timeout:
            return jsonify({'success': False, 'error': 'Timeout при запросе к API'}), 408
        except Exception as e:
            return jsonify({'success': False, 'error': f'Ошибка запроса: {str(e)}'}), 500
        
        print(f"✅ API ответ получен, всего товаров: {len(api_data.get('data', []))}")
        
        # Создаём быстрый поиск товаров по SKU из API ответа
        api_products_map = {}
        total_api_items = 0
        first_product = None
        if "data" in api_data:
            for category in api_data["data"]:
                if "products" in category:
                    for product in category["products"]:
                        product_sku = str(product.get("sku", "")).strip()
                        api_products_map[product_sku] = product
                        if not first_product:
                            first_product = product
                        total_api_items += 1
        
        # DEBUG: логируем структуру первого товара из API
        if first_product:
            print(f"\n📦 ПЕРВЫЙ ТОВАР ИЗ API /api/menu/Menus:")
            print(f"   - Ключи: {list(first_product.keys())}")
            print(f"   - id: {first_product.get('id')}")
            print(f"   - productId: {first_product.get('productId')}")
            print(f"   - sku: {first_product.get('sku')}")
            print()
        
        print(f"   - Всего товаров в API: {total_api_items}")
        print(f"   - Товаров в накладной: {len(invoice_data)}")
        
        # Собираем таблицу в порядке из invoice_data (то что пользователь загрузил)
        table_rows = []
        not_found = []
        
        for sku, our_qtn in invoice_data.items():
            if sku in api_products_map:
                product = api_products_map[sku]
                api_qtn = float(product.get("qtn", 0))  # Гарантируем float для поддержки дробных чисел
                our_qtn_float = float(our_qtn) if our_qtn else 0.0  # Гарантируем float
                total_qtn = api_qtn + our_qtn_float
                # Получаем productId из API ответа
                product_id = product.get("id") or product.get("productId", "")
                
                # DEBUG: логируем если productId пуст
                if not product_id:
                    print(f"⚠️ WARNING: Нет productId для SKU {sku}")
                    print(f"   Ключи в product: {list(product.keys())}")
                
                table_rows.append({
                    "sku": sku,
                    "productId": product_id,
                    "name": product.get("nameRu", ""),
                    "api_qtn": api_qtn,
                    "our_qtn": our_qtn_float,
                    "total_qtn": total_qtn
                })
            else:
                not_found.append(sku)
        
        print(f"   - Найдено в API: {len(table_rows)}")
        print(f"   - Не найдено в API: {len(not_found)}")
        if not_found:
            print(f"   - SKU не найдены: {not_found[:5]}{'...' if len(not_found) > 5 else ''}")
        
        # Вывод таблицы товаров которые есть в накладной, но нет на сервере
        if not_found:
            print(f"\n{'='*100}")
            print("📋 ТОВАРЫ ИЗ НАКЛАДНОЙ, ОТСУТСТВУЮЩИЕ НА СЕРВЕРЕ:")
            print(f"{'='*100}")
            print(f"{'№':<5} {'SKU':<20} {'Название':<40} {'Количество':<15}")
            print(f"{'-'*100}")
            for idx, sku in enumerate(not_found, 1):
                qtn = invoice_data.get(sku, 0)
                name = invoice_names.get(sku, 'Не указано')
                # Обрезаем название если оно слишком длинное
                display_name = (name[:37] + '...') if len(name) > 40 else name
                print(f"{idx:<5} {sku:<20} {display_name:<40} {qtn:<15}")
            print(f"{'='*100}")
            print(f"Всего товаров отсутствует на сервере: {len(not_found)}")
            print(f"{'='*100}\n")
        
        print(f"{'='*60}\n")
        
        # DEBUG: логируем первую строку которую отправляем на frontend
        if table_rows:
            print(f"📤 ПЕРВАЯ СТРОКА В ОТВЕТЕ /api/get-menu-items:")
            print(f"   {json.dumps(table_rows[0], indent=2, ensure_ascii=False)}\n")
        
        # Формируем список отсутствующих товаров для фронтенда
        missing_items = []
        for sku in not_found:
            qtn = invoice_data.get(sku, 0)
            name = invoice_names.get(sku, 'Не указано')
            missing_items.append({
                'sku': sku,
                'name': name,
                'quantity': qtn
            })
        
        return jsonify({
            'success': True, 
            'rows': table_rows, 
            'total': total_api_items,
            'missing_items': missing_items  # Товары из накладной, которых нет на сервере
        }), 200
    
    except Exception as e:
        print(f"❌ Ошибка в /api/get-menu-items: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/update-quantities', methods=['POST'])
def update_quantities():
    """POST запрос для обновления количеств товаров на сервере"""
    try:
        data = request.get_json()
        # Принимаем как jwt, так и jwt_token для совместимости
        jwt_token = data.get('jwt') or data.get('jwt_token', '').strip()
        payloads = data.get('payloads', [])
        
        if not jwt_token:
            return jsonify({'success': False, 'error': 'JWT токен не предоставлен'}), 400
        
        if not payloads:
            return jsonify({'success': False, 'error': 'Нет данных для отправки'}), 400
        
        # Логируем входящий payload
        print("\n" + "="*60)
        print("📥 INCOMING PAYLOADS от frontend:")
        print("="*60)
        print(json.dumps(payloads[:3], indent=2, ensure_ascii=False))
        print(f"... (всего {len(payloads)} записей)")
        print("="*60 + "\n")
        
        # Трансформируем payloads в формат ожидаемый API Safia:
        # Frontend отправляет: {"sku": "...", "qtn": 5.0, "productId": "550e8400..."}
        # API ожидает: {"productId": "550e8400...", "sku": "...", "qtn": 5.0}
        formatted_payloads = []
        for payload in payloads:
            product_id = payload.get('productId') or payload.get('id', '')
            
            # Валидация: productId обязателен
            if not product_id:
                print(f"⚠️ WARNING: productId отсутствует для SKU {payload.get('sku')}")
            
            formatted_payload = {
                "productId": product_id,
                "sku": payload.get('sku', ''),
                "qtn": float(payload.get('qtn', 0))
            }
            formatted_payloads.append(formatted_payload)
        
        print("\n" + "="*60)
        print("📤 FORMATTED PAYLOADS для /api/menu/ChangeQuantity:")
        print("="*60)
        print(json.dumps(formatted_payloads, indent=2, ensure_ascii=False))
        print("="*60 + "\n")
        
        # POST запрос к API для обновления количеств
        url = "https://orderconfirmer-api.safiadelivery.com/api/menu/ChangeQuantity"
        
        try:
            response = requests.post(
                url,
                json=formatted_payloads,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {jwt_token}"
                },
                timeout=30
            )
            
            if response.status_code != 200:
                error_msg = f'API вернул статус {response.status_code}'
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', error_msg)
                except:
                    error_msg = response.text[:200]
                return jsonify({'success': False, 'error': error_msg}), 400
            
            response_data = response.json()
            
        except requests.exceptions.Timeout:
            return jsonify({'success': False, 'error': 'Timeout при запросе к API'}), 408
        except Exception as e:
            return jsonify({'success': False, 'error': f'Ошибка запроса: {str(e)}'}), 500
        
        # Возвращаем результат
        return jsonify({
            'success': True,
            'success_count': len(payloads),
            'response': response_data
        }), 200
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@api_bp.route('/get-session-data', methods=['GET'])
def get_session_data():
    try:
        from flask import session as flask_session
        
        # Получаем session ID
        session_id = flask_session.get('session_id') or request.args.get('session_id')
        
        if session_id:
            session_manager = SessionManager(str(session_id))
            # Загружаем payloads из файла
            payloads_data = session_manager.load_json('payloads.json', 'temp') or {}
            payloads = payloads_data.get('payloads', []) if isinstance(payloads_data, dict) else payloads_data
            stage1_data = session_manager.load_json('stage1_data.json', 'temp')
            qtn_map = {p.get('sku'): p.get('qtn', 0) for p in payloads if isinstance(p, dict)}
        else:
            # Fallback на Flask session
            payloads = flask_session.get('payloads', [])
            stage1_data = flask_session.get('stage1_data')
            qtn_map = {p.get('sku'): p.get('qtn', 0) for p in payloads if isinstance(p, dict)} if payloads else {}
        
        return jsonify({
            'transformed_data': flask_session.get('transformed_data'),
            'stage1_data': stage1_data,
            'payloads': payloads,
            'qtn_map': qtn_map,
            'original_filename': flask_session.get('original_filename')
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
