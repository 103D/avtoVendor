import requests

r = requests.post('http://127.0.0.1:5000/api/get-token', json={'username':'Lassio','password':'x'})
print('STATUS', r.status_code)
try:
    print(r.json())
except Exception as e:
    print('JSON ERR', e)
    print(r.text)
