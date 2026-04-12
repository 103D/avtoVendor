import json

# Чтение исходного файла
def load_data(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        return json.load(f)

# Преобразование структуры данных
def transform(data):
    result = {"total": data.get("total", 0), "success": data.get("success", True), "message": data.get("message"), "data": []}
    for category in data["data"]:
        new_category = {
            "id": category["id"],
            "nameRu": category["nameRu"],
            "products": []
        }
        for product in category["products"]:
            new_product = {
                "id": product["id"],
                "nameRu": product["nameRu"],
                "sku": product["sku"]
            }
            new_category["products"].append(new_product)
        result["data"].append(new_category)
    return result

# Запись преобразованных данных
def save_data(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    src = "data.json"
    dst = "data1.json"
    data = load_data(src)
    new_data = transform(data)
    save_data(dst, new_data)
    print(f"Преобразование завершено. Результат сохранён в {dst}")
