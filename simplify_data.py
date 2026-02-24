import json
import os

# Читаем исходный файл
with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Создаем упрощенную структуру
simplified = {
    "total": data.get("total", 0),
    "success": data.get("success", True),
    "message": data.get("message"),
    "data": []
}

# Проходим по категориям
for category in data.get("data", []):
    simplified_category = {
        "id": category.get("id"),
        "nameRu": category.get("nameRu"),
        "products": []
    }
    
    # Проходим по товарам в каждой категории
    for product in category.get("products", []):
        simplified_product = {
            "id": product.get("id"),
            "nameRu": product.get("nameRu"),
            "sku": product.get("sku")
        }
        simplified_category["products"].append(simplified_product)
    
    simplified["data"].append(simplified_category)

# Сохраняем упрощенный файл
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(simplified, f, ensure_ascii=False, indent=2)

print(f"✅ Файл упрощен успешно!")
print(f"📊 Категорий: {len(simplified['data'])}")
total_products = sum(len(cat.get('products', [])) for cat in simplified['data'])
print(f"📊 Товаров: {total_products}")
print(f"📦 Размер файла: {os.path.getsize('data.json') / 1024:.1f} KB")
