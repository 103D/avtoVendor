#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wrapper для lassio_transform.py который выводит результат в JSON формате
для использования веб-интерфейсом.
"""

import sys
import json
import argparse
import pandas as pd
from pathlib import Path
from typing import Any, List, Dict

# Попытка импорта python-docx для поддержки docx файлов
try:
    from docx import Document
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

# Добавить папку Difference в путь для импорта
sys.path.insert(0, str(Path(__file__).parent.parent / 'Difference'))


def is_sku_code(text: str) -> bool:
    """
    Определяет, является ли текст SKU кодом товара.
    SKU коды имеют два паттерна:
    1. Полностью цифры (4 и более символов): например 12345
    2. Начинаются с "F0" и затем остальное цифры: например F0123, F01234
    """
    if not text or len(text) < 1:
        return False
    
    text = text.strip()
    
    # Пропускаем служебные слова
    if text.lower() in ['sku', 'код', 'kod', 'kod tovarа', 'nazvanie', 'kol-vo', 'итого', 'сумма', 'итоги']:
        return False
    
    # Паттерн 1: Полностью цифры (4 или более символов)
    if text.isdigit() and len(text) >= 4:
        return True
    
    # Паттерн 2: Начинается с "F0" и остальное цифры (F0XXXX)
    if text.startswith('F0') and len(text) >= 4:
        rest = text[2:]  # Всё после "F0"
        if rest.isdigit():
            return True
    
    return False


def extract_from_docx(file_path: str) -> List[Dict[str, Any]]:
    """
    Извлекает данные из DOCX файла.
    """
    if not HAS_DOCX:
        raise RuntimeError("Библиотека python-docx не установлена. Установите: pip install python-docx")
    
    doc = Document(file_path)
    if not doc.tables:
        raise ValueError("В документе нет таблиц")
    
    table = doc.tables[0]
    products: List[Dict[str, Any]] = []
    
    # Обработка: начинаем с 14-й строки (индекс 13)
    for row_idx in range(13, len(table.rows)):
        row = table.rows[row_idx]
        
        # Проверяем служебные строки
        first_cell = row.cells[0].text.strip()
        if first_cell in ['Итого', 'Сумма', 'ИТОГО'] or not first_cell:
            continue
        
        if first_cell.lower() in ['sku', 'kod', 'kod tovarа', 'nazvanie', 'kol-vo', 'итоги']:
            continue
        
        # 1. Ищем SKU (код товара) в любой ячейке строки
        code = ""
        code_cell_idx = -1
        for cell_idx, cell in enumerate(row.cells):
            cell_text = cell.text.strip()
            if is_sku_code(cell_text):
                code = cell_text
                code_cell_idx = cell_idx
                break
        
        if not code:
            continue
        
        # 2. Название берем из той же строки (обычно после SKU)
        name = ""
        for cell_idx in range(code_cell_idx + 1, len(row.cells)):
            cell_text = row.cells[cell_idx].text.strip()
            
            if not cell_text:
                continue
            
            # Пропускаем числа
            if cell_text.replace('.', '').replace(',', '').isdigit():
                continue
            
            # Пропускаем если это похоже на SKU
            if is_sku_code(cell_text):
                continue
            
            name = cell_text
            break
        
        if not name:
            continue
        
        # 3. Количество - первое число ПОСЛЕ названия
        quantity = None
        name_cell_idx = -1
        for cell_idx in range(code_cell_idx, len(row.cells)):
            if row.cells[cell_idx].text.strip() == name:
                name_cell_idx = cell_idx
                break
        
        if name_cell_idx >= 0:
            # Проход 1: ищем число >= 1
            for cell_idx in range(name_cell_idx + 1, len(row.cells)):
                cell_text = row.cells[cell_idx].text.strip()
                if cell_text:
                    try:
                        qty_str = cell_text.replace(',', '.')
                        qty_val = float(qty_str)
                        if qty_val >= 1:
                            quantity = qty_val
                            break
                    except (ValueError, TypeError):
                        continue
            
            # Проход 2: если не нашли >= 1, ищем число >= 0
            if quantity is None:
                for cell_idx in range(name_cell_idx + 1, len(row.cells)):
                    cell_text = row.cells[cell_idx].text.strip()
                    if cell_text:
                        try:
                            qty_str = cell_text.replace(',', '.')
                            qty_val = float(qty_str)
                            if qty_val >= 0:
                                quantity = qty_val
                                break
                        except (ValueError, TypeError):
                            continue
        
        products.append({
            'sku': code,
            'name': name,
            'qtn_invoice': quantity,
            'qtn_fact': quantity
        })
    
    return products


def extract_from_excel(file_path: str) -> List[Dict[str, Any]]:
    """
    Извлекает данные из Excel файла автоматически.
    Логика:
    1. Ищет колонку с SKU (начинается на 'F0')
    2. Следующий столбец - название
    3. Первый число после SKU колонки - количество
    """
    try:
        df = pd.read_excel(file_path)  # type: ignore
        
        # Удаляем полностью пустые строки
        df = df.dropna(how="all")  # type: ignore
        
        # Очищаем от служебных строк вверху (если есть)
        df = df.reset_index(drop=True)
        
        products: List[Dict[str, Any]] = []
        
        print(f"\n🔍 Начинаю обработку Excel файла. Всего строк: {len(df)}", file=sys.stderr)
        
        for row_idx, row in df.iterrows():
            # Конвертируем row в dict для удобства
            row_data = row.to_dict()
            
            # Отладка: показываем первые 3 строки
            if row_idx < 3:
                print(f"\n📋 Строка {row_idx}: {list(row_data.values())[:5]}", file=sys.stderr)
            
            # 1. Ищем SKU (код товара) в любой ячейке строки
            sku = ""
            sku_col_idx = -1
            
            for col_idx, (col_name, cell_value) in enumerate(row_data.items()):
                if pd.isna(cell_value):
                    continue
                
                cell_text = str(cell_value).strip()
                
                # Отладка: проверяем каждую ячейку в первых 3 строках
                if row_idx < 3 and cell_text:
                    is_sku = is_sku_code(cell_text)
                    print(f"   Колонка {col_idx}: '{cell_text}' -> is_sku={is_sku}", file=sys.stderr)
                
                if is_sku_code(cell_text):
                    sku = cell_text
                    sku_col_idx = col_idx
                    print(f"   ✅ Найден SKU: '{sku}' в колонке {sku_col_idx}", file=sys.stderr)
                    break
            
            if not sku:
                if row_idx < 3:
                    print(f"   ❌ SKU не найден в строке {row_idx}", file=sys.stderr)
                continue
            
            # 2. Название - следующий не-числовой столбец после SKU
            name = ""
            name_col_idx = -1
            
            columns_list = list(row_data.keys())
            for col_idx in range(sku_col_idx + 1, len(columns_list)):
                cell_value = row_data[columns_list[col_idx]]
                
                if pd.isna(cell_value):
                    continue
                
                cell_text = str(cell_value).strip()
                
                if not cell_text:
                    continue
                
                # Пропускаем числовые значения
                try:
                    float(cell_text.replace(',', '.'))
                    continue  # Это число, пропускаем
                except ValueError:
                    pass  # Это текст, проверяем дальше
                
                # Пропускаем если это похоже на SKU
                if is_sku_code(cell_text):
                    continue
                
                name = cell_text
                name_col_idx = col_idx
                print(f"   ✅ Найдено название: '{name}' в колонке {name_col_idx}", file=sys.stderr)
                break
            
            if not name:
                print(f"   ❌ Название не найдено для SKU '{sku}'", file=sys.stderr)
                continue
            
            # 3. Количество - первое число ПОСЛЕ названия
            quantity = None
            
            if name_col_idx >= 0:
                columns_list = list(row_data.keys())
                
                # Проход 1: ищем число >= 1
                for col_idx in range(name_col_idx + 1, len(columns_list)):
                    cell_value = row_data[columns_list[col_idx]]
                    
                    if pd.isna(cell_value):
                        continue
                    
                    cell_text = str(cell_value).strip()
                    
                    if not cell_text:
                        continue
                    
                    try:
                        qty_val = float(cell_text.replace(',', '.'))
                        if qty_val >= 1:
                            quantity = qty_val
                            break
                    except ValueError:
                        continue
                
                # Проход 2: если не нашли >= 1, ищем число >= 0
                if quantity is None:
                    for col_idx in range(name_col_idx + 1, len(columns_list)):
                        cell_value = row_data[columns_list[col_idx]]
                        
                        if pd.isna(cell_value):
                            continue
                        
                        cell_text = str(cell_value).strip()
                        
                        if not cell_text:
                            continue
                        
                        try:
                            qty_val = float(cell_text.replace(',', '.'))
                            if qty_val >= 0:
                                quantity = qty_val
                                break
                        except ValueError:
                            continue
            
            # Добавляем товар если количество найдено
            if quantity is not None:
                print(f"   ✅ Добавлен товар: SKU='{sku}', Название='{name}', Количество={quantity}", file=sys.stderr)
                products.append({
                    'sku': sku,
                    'name': name,
                    'qtn_invoice': quantity,
                    'qtn_fact': quantity
                })
            else:
                print(f"   ❌ Количество не найдено для SKU '{sku}' (название: '{name}')", file=sys.stderr)
        
        print(f"\n✅ Обработка завершена. Найдено товаров: {len(products)}\n", file=sys.stderr)
        return products
        
    except Exception as e:
        raise RuntimeError(f"Ошибка при обработке Excel файла: {str(e)}")


def transform_to_json(file_path: str) -> List[Dict[str, Any]]:
    """
    Трансформирует файл Лассио в JSON формат для фронта.
    Автоматически определяет тип файла (XLSX или DOCX).
    Использует единую логику автоматического определения колонок.
    """
    file_ext = Path(file_path).suffix.lower()
    
    # Проверяем расширение и вызываем нужную функцию
    if file_ext == '.docx':
        return extract_from_docx(file_path)
    else:
        # Для всех Excel файлов (.xlsx, .xls, .xlsm)
        return extract_from_excel(file_path)


def main():
    parser = argparse.ArgumentParser(description='Transform Lassio Excel to JSON')
    parser.add_argument('--source', type=str, required=True, help='Path to source Excel file')
    parser.add_argument('--output', type=str, default=None, help='Output JSON file path (optional)')
    
    args = parser.parse_args()
    
    file_path = Path(args.source)
    
    if not file_path.exists():
        print(json.dumps({'error': f'Файл не найден: {args.source}'}))
        sys.exit(1)
    
    try:
        result = transform_to_json(str(file_path))
        
        # Выводим JSON в stdout
        print(json.dumps(result, ensure_ascii=False, indent=2))
        
        # Опционально сохраняем в файл
        if args.output:
            output_path = Path(args.output)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
        
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({'error': str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
