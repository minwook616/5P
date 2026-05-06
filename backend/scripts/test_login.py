import http.client, json

conn = http.client.HTTPConnection("127.0.0.1", 8000)
payload = json.dumps({"email":"testbot0495@iastate.edu","password":"Testpass123!"})
headers = {"Content-Type":"application/json"}
conn.request("POST", "/api/auth/login", payload, headers)
res = conn.getresponse()
print(res.status, res.reason)
print('Headers:')
for k,v in res.getheaders():
    if k.lower().startswith('set-cookie'):
        print('  Set-Cookie:', v)
print('Body:')
print(res.read().decode())
